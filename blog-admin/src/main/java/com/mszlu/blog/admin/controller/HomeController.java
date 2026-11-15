package com.mszlu.blog.admin.controller;

import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;

/**
 * 根路径入口：已登录进后台主页，未登录进登录页。
 * 原来这里返回一段 JSON，导致直接访问 localhost:8889 时既不是后台也不是登录页。
 */
@Controller
public class HomeController {

    @GetMapping("/")
    public String home(Authentication authentication) {
        boolean logged = authentication != null
                && authentication.isAuthenticated()
                && !(authentication instanceof AnonymousAuthenticationToken);
        return logged ? "redirect:/pages/main.html" : "redirect:/login.html";
    }
}
