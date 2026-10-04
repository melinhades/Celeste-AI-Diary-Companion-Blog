package com.mszlu.blog.service.ai.roundtable;

import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class RosterBuilderTest {

    @Test
    void sixSeats_userIsHuman_restAreAi() {
        RoundtableSession s = new RoundtableSession();
        s.setUserNickname("小明");

        List<Map<String, Object>> seats = RosterBuilder.build(s);

        assertEquals(6, seats.size());
        Map<String, Object> user = seats.stream().filter(m -> "user".equals(m.get("id"))).findFirst().orElseThrow();
        assertEquals(true, user.get("human"));
        assertEquals("小明", user.get("name"));
        assertEquals("议题主人", user.get("title"));

        long aiCount = seats.stream().filter(m -> Boolean.TRUE.equals(m.get("human")) == false).count();
        assertEquals(5, aiCount);
    }

    @Test
    void nicknameNullOrEmpty_fallsBackToDefault() {
        RoundtableSession s = new RoundtableSession();
        s.setUserNickname(null);
        List<Map<String, Object>> seats = RosterBuilder.build(s);
        Map<String, Object> user = seats.stream().filter(m -> "user".equals(m.get("id"))).findFirst().orElseThrow();
        assertEquals("你", user.get("name"));
    }

    @Test
    void seatOrderIsStable() {
        RoundtableSession s = new RoundtableSession();
        s.setUserNickname("x");
        List<Map<String, Object>> seats = RosterBuilder.build(s);
        assertEquals("madeline", seats.get(0).get("id"));
        assertEquals("theo", seats.get(1).get("id"));
        assertEquals("user", seats.get(2).get("id"));
        assertEquals("granny", seats.get(3).get("id"));
        assertEquals("badeline", seats.get(4).get("id"));
        assertEquals("oshiro", seats.get(5).get("id"));
    }
}
