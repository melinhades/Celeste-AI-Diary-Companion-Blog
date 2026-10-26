package com.mszlu.blog.service.diarychat;

import com.mszlu.blog.dao.mapper.DiaryMapper;
import com.mszlu.blog.service.ai.AiClient;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Collections;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;

/**
 * faceEmotion（日记页表情池 7 选 1）映射测试。
 * 通过 extract() 端到端验证 Plutchik → faceEmotion 的映射规则：
 * - sadness → 不开心，anger → 怨恨，fear → 不安
 * - joy 高分 → 可爱，joy 低分 → 默认
 * - 情绪强度低于阈值 → 默认（不为变化而变化）
 * - 情绪矛盾（否定+正向词）→ 无语
 */
@ExtendWith(MockitoExtension.class)
class DiaryChatFaceEmotionTest {

    @Mock
    private AiClient aiClient;

    @Mock
    private DiaryMapper diaryMapper;

    @InjectMocks
    private DiaryChatEmotionExtractor extractor;

    private static String aiJson(String primary, int valence, double rawScore) {
        return "{\"plutchik_primary\":\"" + primary + "\","
                + "\"plutchik_secondary\":null,"
                + "\"intensity\":3,"
                + "\"valence\":" + valence + ","
                + "\"raw_score\":" + rawScore + ","
                + "\"anchor_start\":-1,"
                + "\"anchor_end\":-1}";
    }

    @BeforeEach
    void setUp() {
        // embed 全部返回 null：跳过原型句缓存与文本 embedding 交叉验证，
        // 走纯文本侧关键词兜底路径，避免外部 AI 依赖
        lenient().when(aiClient.embed(any())).thenReturn(null);
        // 跨日记趋势：无历史日记
        lenient().when(diaryMapper.selectList(any())).thenReturn(Collections.emptyList());
    }

    @Test
    void sadness_不开心() {
        when(aiClient.chat(anyList(), eq(true))).thenReturn(aiJson("sadness", -1, 0.8));
        DiaryChatEmotionExtractor.EmotionResult r = extractor.extract("悲伤的一天，情绪低落", null, "u1");
        assertThat(r.faceEmotion).isEqualTo("不开心");
    }

    @Test
    void anger_怨恨() {
        when(aiClient.chat(anyList(), eq(true))).thenReturn(aiJson("anger", -1, 0.8));
        DiaryChatEmotionExtractor.EmotionResult r = extractor.extract("愤怒的一天", null, "u1");
        assertThat(r.faceEmotion).isEqualTo("怨恨");
    }

    @Test
    void fear_不安() {
        when(aiClient.chat(anyList(), eq(true))).thenReturn(aiJson("fear", -1, 0.8));
        DiaryChatEmotionExtractor.EmotionResult r = extractor.extract("害怕的一天", null, "u1");
        assertThat(r.faceEmotion).isEqualTo("不安");
    }

    @Test
    void joy高分_可爱() {
        // raw_score=1.0：自适应融合会把文本分与轨迹分(0)加权，需足够高才能越过 joy 的 0.55 阈值
        when(aiClient.chat(anyList(), eq(true))).thenReturn(aiJson("joy", 1, 1.0));
        DiaryChatEmotionExtractor.EmotionResult r = extractor.extract("快乐的一天", null, "u1");
        assertThat(r.faceEmotion).isEqualTo("可爱");
    }

    @Test
    void joy低分_默认() {
        when(aiClient.chat(anyList(), eq(true))).thenReturn(aiJson("joy", 1, 0.4));
        DiaryChatEmotionExtractor.EmotionResult r = extractor.extract("快乐的一天", null, "u1");
        assertThat(r.faceEmotion).isEqualTo("默认");
    }

    @Test
    void 情绪强度低于阈值_默认() {
        when(aiClient.chat(anyList(), eq(true))).thenReturn(aiJson("sadness", -1, 0.1));
        DiaryChatEmotionExtractor.EmotionResult r = extractor.extract("悲伤的一天", null, "u1");
        assertThat(r.faceEmotion).isEqualTo("默认");
    }

    @Test
    void 情绪矛盾_无语() {
        // 否定词「不」+ 正向词「开心」邻接 → detectConflict 判定矛盾(score=0.7) → 无语
        when(aiClient.chat(anyList(), eq(true))).thenReturn(aiJson("joy", 1, 1.0));
        DiaryChatEmotionExtractor.EmotionResult r = extractor.extract("不开心的一天", null, "u1");
        assertThat(r.faceEmotion).isEqualTo("无语");
    }
}
