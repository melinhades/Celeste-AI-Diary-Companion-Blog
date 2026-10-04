package com.mszlu.blog.dao.controller;

import com.mszlu.blog.dao.pojo.SysUser;
import com.mszlu.blog.service.LoginService;
import com.mszlu.blog.service.ai.roundtable.RoundtableEngine;
import com.mszlu.blog.service.ai.roundtable.RoundtableSession;
import com.mszlu.blog.service.ai.roundtable.RoundtableTopicService;
import com.mszlu.blog.utils.UserThreadLocal;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.lang.reflect.Field;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@ExtendWith(MockitoExtension.class)
class RoundtableControllerTest {

    @Mock private LoginService loginService;
    @Mock private RoundtableEngine engine;
    @Mock private RoundtableTopicService topicService;

    @InjectMocks private RoundtableController controller;

    private MockMvc mockMvc;
    private Map<String, RoundtableSession> sessions;

    @BeforeEach
    void setUp() throws Exception {
        mockMvc = MockMvcBuilders.standaloneSetup(controller).build();
        Field f = RoundtableController.class.getDeclaredField("sessions");
        f.setAccessible(true);
        sessions = new ConcurrentHashMap<>();
        f.set(controller, sessions);

        SysUser me = new SysUser();
        me.setId("100");
        me.setNickname("Tester");
        UserThreadLocal.put(me);
    }

    @AfterEach
    void tearDown() {
        UserThreadLocal.remove();
    }

    private RoundtableSession makeSession(String id, String status, String nickname, String topic) {
        RoundtableSession s = new RoundtableSession();
        s.setId(id);
        s.setStatus(status);
        s.setUserNickname(nickname);
        s.setTopic(topic);
        s.setUserId("1");
        s.setCreatedAt(System.currentTimeMillis());
        return s;
    }

    @Test
    void live_returnsOnlyRunningSessions_withAllFields() throws Exception {
        sessions.put("a", makeSession("a", "RUNNING", "Alice", "议题A"));
        sessions.put("b", makeSession("b", "FINISHED", "Bob", "议题B"));
        sessions.put("c", makeSession("c", "RUNNING", "Carol", "议题C"));

        mockMvc.perform(get("/roundtable/live"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.length()").value(2))
                .andExpect(jsonPath("$.data[0].id").exists())
                .andExpect(jsonPath("$.data[0].topic").exists())
                .andExpect(jsonPath("$.data[0].userNickname").exists())
                .andExpect(jsonPath("$.data[0].startedAt").exists())
                .andExpect(jsonPath("$.data[0].speechCount").exists())
                .andExpect(jsonPath("$.data[0].observerCount").exists());
    }

    @Test
    void interject_nonOwner_returns403() throws Exception {
        sessions.put("a", makeSession("a", "RUNNING", "Alice", "议题A"));
        // session userId="1", 当前用户 id=100 → 非 owner

        mockMvc.perform(post("/roundtable/a/interject")
                        .contentType("application/json")
                        .content("{\"content\":\"hello\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(403));
    }

    @Test
    void stop_nonOwner_returns403() throws Exception {
        sessions.put("a", makeSession("a", "RUNNING", "Alice", "议题A"));

        mockMvc.perform(post("/roundtable/a/stop"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(403));
    }

    @Test
    void interject_owner_succeeds() throws Exception {
        RoundtableSession s = makeSession("a", "RUNNING", "Tester", "议题A");
        s.setUserId("100");
        sessions.put("a", s);

        mockMvc.perform(post("/roundtable/a/interject")
                        .contentType("application/json")
                        .content("{\"content\":\"我觉得吧\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true));
        assertEquals(1, s.getInterjections().size());
    }
}
