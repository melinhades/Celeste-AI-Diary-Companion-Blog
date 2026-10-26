package com.mszlu.blog.service.diarychat;

import com.mszlu.blog.service.ai.AiClient;
import com.mszlu.blog.service.ai.AiMessage;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * Madeline 人格一致性检查器测试。
 *
 * 锁定三条兜底语义（面试讲点：外部 AI 不可信，所有失败路径都不能中断用户对话）：
 * 1. 检查器 AI 调用失败（null）→ 保守放行原回复；
 * 2. 检查器返回非法 JSON → 保守放行原回复；
 * 3. 连续 3 次检查未过 → 兜底温柔回应「嗯，我在听～」。
 */
@ExtendWith(MockitoExtension.class)
class DiaryChatPersonaCheckerTest {

    @Mock
    private AiClient aiClient;

    @InjectMocks
    private DiaryChatPersonaChecker checker;

    private static final String SYS = "system-prompt";
    private static final String CTX = "用户日记内容";
    private static final String INTENT = "吐槽";

    private static String passJson() {
        return "{\"pass\":true,\"fail_reason\":\"\",\"suggestion\":\"\"}";
    }

    private static String failJson(String reason, String suggestion) {
        return "{\"pass\":false,\"fail_reason\":\"" + reason + "\",\"suggestion\":\"" + suggestion + "\"}";
    }

    @BeforeEach
    void setUp() {
        // 默认每次检查都通过，各用例按需覆盖
        lenient().when(aiClient.chat(anyList(), eq(true))).thenReturn(passJson());
    }

    // ================= 正常通过 =================

    @Test
    void firstCheckPass_returnsTrimmedRaw() {
        DiaryChatPersonaChecker.CheckResult r =
                checker.ensurePersona("  我在听，继续说。  ", SYS, CTX, INTENT);

        assertTrue(r.pass);
        assertEquals("我在听，继续说。", r.finalResponse);
        assertNull(r.failReason);
        // 只跑了一次检查，未触发重新生成
        verify(aiClient, times(1)).chat(anyList(), eq(true));
        verify(aiClient, never()).chat(anyList());
    }

    @Test
    void nullRaw_treatedAsEmpty_andChecked() {
        DiaryChatPersonaChecker.CheckResult r = checker.ensurePersona(null, SYS, CTX, INTENT);
        assertTrue(r.pass);
        assertEquals("", r.finalResponse);
    }

    // ================= AI 不可信兜底 =================

    @Test
    void checkerAiReturnsNull_conservativePass() {
        when(aiClient.chat(anyList(), eq(true))).thenReturn(null);

        DiaryChatPersonaChecker.CheckResult r = checker.ensurePersona("原回复", SYS, CTX, INTENT);

        assertTrue(r.pass, "检查器 AI 挂了应保守放行，不能中断对话");
        assertEquals("原回复", r.finalResponse);
    }

    @Test
    void checkerReturnsBrokenJson_conservativePass() {
        when(aiClient.chat(anyList(), eq(true))).thenReturn("<<< not json");

        DiaryChatPersonaChecker.CheckResult r = checker.ensurePersona("原回复", SYS, CTX, INTENT);

        assertTrue(r.pass);
        assertEquals("原回复", r.finalResponse);
    }

    // ================= 未过 → 采用建议 =================

    @Test
    void failWithSuggestion_adoptsSuggestion_thenPasses() {
        when(aiClient.chat(anyList(), eq(true)))
                .thenReturn(failJson("R4", "听起来你真的很累，想先说说哪件事吗？"))
                .thenReturn(passJson());

        DiaryChatPersonaChecker.CheckResult r = checker.ensurePersona("加油，一切都会好的", SYS, CTX, INTENT);

        assertTrue(r.pass);
        assertEquals("听起来你真的很累，想先说说哪件事吗？", r.finalResponse);
        // 检查跑了 2 次，走 suggestion 路径不需要重新生成
        verify(aiClient, times(2)).chat(anyList(), eq(true));
        verify(aiClient, never()).chat(anyList());
    }

    // ================= 未过且无建议 → 重新生成 =================

    @Test
    void failWithoutSuggestion_regenerates_thenPasses() {
        when(aiClient.chat(anyList(), eq(true)))
                .thenReturn(failJson("R2", ""))
                .thenReturn(passJson());
        when(aiClient.chat(anyList())).thenReturn("重新生成的温柔回复");

        DiaryChatPersonaChecker.CheckResult r = checker.ensurePersona("这有什么好难过的", SYS, CTX, INTENT);

        assertTrue(r.pass);
        assertEquals("重新生成的温柔回复", r.finalResponse);
        verify(aiClient, times(2)).chat(anyList(), eq(true));
        verify(aiClient, times(1)).chat(anyList());
    }

    @Test
    void blankSuggestion_treatedAsNoSuggestion_regenerates() {
        when(aiClient.chat(anyList(), eq(true)))
                .thenReturn(failJson("R4", "   "))
                .thenReturn(passJson());
        when(aiClient.chat(anyList())).thenReturn("新回复");

        DiaryChatPersonaChecker.CheckResult r = checker.ensurePersona("保持积极", SYS, CTX, INTENT);

        assertEquals("新回复", r.finalResponse);
        verify(aiClient, times(1)).chat(anyList());
    }

    @Test
    void regenerateReturnsNull_breaksToFallback() {
        when(aiClient.chat(anyList(), eq(true))).thenReturn(failJson("R1", ""));
        when(aiClient.chat(anyList())).thenReturn(null);

        DiaryChatPersonaChecker.CheckResult r = checker.ensurePersona("建议咨询医生开点药", SYS, CTX, INTENT);

        assertFalse(r.pass);
        assertEquals("嗯，我在听～", r.finalResponse);
    }

    // ================= 连续 3 次未过 → 兜底 =================

    @Test
    void threeAttemptsAllFailWithSuggestion_fallbackGentle() {
        when(aiClient.chat(anyList(), eq(true)))
                .thenReturn(failJson("R4", "建议1"))
                .thenReturn(failJson("R4", "建议2"))
                .thenReturn(failJson("R4", "建议3"));

        DiaryChatPersonaChecker.CheckResult r = checker.ensurePersona("初始坏回复", SYS, CTX, INTENT);

        assertFalse(r.pass);
        assertEquals("连续3次人格检查未过", r.failReason);
        assertEquals("嗯，我在听～", r.finalResponse);
        // 恰好 3 次检查，suggestion 路径不触发重新生成
        verify(aiClient, times(3)).chat(anyList(), eq(true));
        verify(aiClient, never()).chat(anyList());
    }

    @Test
    void threeAttemptsAllFailViaRegenerate_fallbackGentle() {
        when(aiClient.chat(anyList(), eq(true))).thenReturn(failJson("R2", ""));
        when(aiClient.chat(anyList())).thenReturn("还是不行");

        DiaryChatPersonaChecker.CheckResult r = checker.ensurePersona("初始坏回复", SYS, CTX, INTENT);

        assertFalse(r.pass);
        assertEquals("嗯，我在听～", r.finalResponse);
        verify(aiClient, times(3)).chat(anyList(), eq(true));
        verify(aiClient, times(3)).chat(anyList());
    }

    @Test
    void thirdAttemptPasses_noFallback() {
        // 第 3 次才通过：不兜底，用第 3 次通过的回复
        when(aiClient.chat(anyList(), eq(true)))
                .thenReturn(failJson("R4", "改1"))
                .thenReturn(failJson("R4", "改2"))
                .thenReturn(passJson());

        DiaryChatPersonaChecker.CheckResult r = checker.ensurePersona("坏回复", SYS, CTX, INTENT);

        assertTrue(r.pass);
        assertEquals("改2", r.finalResponse);
        verify(aiClient, times(3)).chat(anyList(), eq(true));
    }

    // ================= 检查请求本身 =================

    @Test
    void checkRequest_usesJsonMode_andCarriesContext() {
        checker.ensurePersona("回复", SYS, CTX, INTENT);

        @SuppressWarnings("unchecked")
        var cap = org.mockito.ArgumentCaptor.forClass(List.class);
        verify(aiClient).chat(cap.capture(), eq(true));
        List<AiMessage> msgs = cap.getValue();
        assertEquals(2, msgs.size());
        assertEquals("system", msgs.get(0).getRole());
        assertEquals("user", msgs.get(1).getRole());
        assertTrue(msgs.get(1).getContent().contains(CTX), "检查 prompt 应带用户日记文本");
        assertTrue(msgs.get(1).getContent().contains(INTENT), "检查 prompt 应带意图分类");
    }
}
