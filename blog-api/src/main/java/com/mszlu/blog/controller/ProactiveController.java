package com.mszlu.blog.controller;

import com.mszlu.blog.dao.pojo.SysUser;
import com.mszlu.blog.service.ProactiveService;
import com.mszlu.blog.service.TokenService;
import com.mszlu.blog.utils.UserThreadLocal;
import com.mszlu.blog.vo.Result;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;

@RestController
@RequestMapping("proactive")
public class ProactiveController {

    @Autowired
    private ProactiveService proactiveService;

    @Autowired
    private TokenService tokenService;

    /** 前端进聊天页时轮询：有没有 AI 主动发来的话 */
    @GetMapping("latest")
    public Result latestUnread() {
        return proactiveService.latestUnread();
    }

    /**
     * 调试/运维专用：手动触发一次每日决策（会遍历全体用户并调用系统 AI Key）。
     * 仅管理员可用：SysUser.admin 已在登录态里，拦截器把当前用户放进 UserThreadLocal，
     * 这里直接做管理员校验，避免任何普通用户触发全量主动消息、消耗系统 Key。
     */
    @PostMapping("trigger")
    public Result trigger() {
        SysUser me = UserThreadLocal.get();
        if (me == null) return Result.fail(401, "未登录");
        if (me.getAdmin() == null || me.getAdmin() != 1) return Result.fail(403, "需要管理员权限");
        proactiveService.dailyReachOut();
        return Result.success("已触发，看日志和 proactive_log 表");
    }

    /** SSE 订阅主动消息推送（复用 RealtimeChatController 的 token query 鉴权模式） */
    @GetMapping("stream")
    public SseEmitter stream(@RequestParam(value = "token", required = false) String token,
                             jakarta.servlet.http.HttpServletResponse response) throws IOException {
        SysUser user = (token == null || token.isEmpty()) ? null : tokenService.checkToken(token);
        if (user == null) {
            response.setStatus(401);
            response.setContentType("application/json;charset=utf-8");
            response.getWriter().write("{\"success\":false,\"code\":401,\"msg\":\"未登录\"}");
            return null;
        }
        return proactiveService.subscribe(user.getId());
    }
}
