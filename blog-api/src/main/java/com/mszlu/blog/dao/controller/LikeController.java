package com.mszlu.blog.dao.controller;

import com.mszlu.blog.dao.pojo.SysUser;
import com.mszlu.blog.service.LikeService;
import com.mszlu.blog.service.LoginService;
import com.mszlu.blog.utils.UserThreadLocal;
import com.mszlu.blog.vo.Result;
import org.apache.commons.lang3.StringUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import javax.servlet.http.HttpServletRequest;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@RestController
@RequestMapping("likes")
public class LikeController {

    @Autowired
    private LikeService likeService;

    @Autowired
    private LoginService loginService;

    // 点赞/取消（需登录，走拦截器）
    @PostMapping("toggle")
    public Result toggle(@RequestBody Map<String, String> body) {
        SysUser user = UserThreadLocal.get();
        return likeService.toggle(body.get("articleId"), user);
    }

    // 点赞数 + 当前用户是否已赞（游客可访问，手动解析 token）
    @GetMapping("info/{articleId}")
    public Result info(@PathVariable("articleId") String articleId, HttpServletRequest request) {
        SysUser user = null;
        String token = request.getHeader("Authorization");
        if (StringUtils.isNotBlank(token)) {
            user = loginService.checkToken(token);
        }
        return likeService.info(articleId, user);
    }

    // 批量查询点赞数（首页卡片用，最多 50 个）
    @GetMapping("counts")
    public Result counts(@RequestParam("ids") String ids) {
        List<String> idList = Arrays.stream(ids.split(","))
                .map(String::trim)
                .filter(StringUtils::isNotBlank)
                .limit(50)
                .collect(Collectors.toList());
        return likeService.batchCounts(idList);
    }
}
