package com.mszlu.blog.controller;

import com.mszlu.blog.service.SysUserService;
import com.mszlu.blog.vo.Result;
import com.mszlu.blog.vo.params.SignatureParam;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("users")
public class UserController {
    @Autowired
    private SysUserService sysUserService;

    @GetMapping("currentUser")
    public Result currentUser(@RequestHeader("Authorization") String token) {
        return sysUserService.findUserByToken(token);
    }

    /** 查询草莓余额（以数据库为准） */
    @GetMapping("berry")
    public Result berry(@RequestHeader("Authorization") String token) {
        return sysUserService.berryBalance(token);
    }

    /**
     * 草莓籽收集奖励：服务端按 6 小时冷却发放，客户端不能传金额。
     * batchId 用于幂等——同一批次重复提交只回报「已发放」，不会重复 +1。
     */
    @PostMapping("berry/seed-claim")
    public Result claimSeedBerry(@RequestHeader("Authorization") String token,
                                 @RequestBody(required = false) java.util.Map<String, String> body) {
        return sysUserService.claimSeedBerry(token, body == null ? null : body.get("batchId"));
    }

    /**
     * 服务端时钟：仅供前端判定草莓籽刷新（滚动 6 小时，不涉及时区/自然日）。
     * 不读用户数据、不需要 token，未登录也能拿到，避免本地时钟偏快/偏慢导致节奏漂移。
     */
    @GetMapping("berry/seed-clock")
    public Result seedClock() {
        return Result.success(java.util.Map.of("serverTime", System.currentTimeMillis()));
    }

    /** 更新个性签名（空串/null 清空） */
    @PutMapping("signature")
    public Result updateSignature(@RequestHeader("Authorization") String token,
                                  @RequestBody SignatureParam param) {
        return sysUserService.updateSignature(token, param == null ? null : param.getSignature());
    }

    /**
     * 设置/清空用户自定义 AI API Key
     * 空串 → 清空（回退系统默认 Key）；非空 → 写入；前后 trim
     * 不校验 Key 格式（各家 AI 厂商 Key 前缀不同，服务端不做假设）；调用方传脏数据只会在真正请求上游时报 401/402
     */
    @PutMapping("api-key")
    public Result updateApiKey(@RequestHeader("Authorization") String token,
                               @RequestBody java.util.Map<String, String> body) {
        String key = (body == null) ? null : body.get("apiKey");
        return sysUserService.updateApiKey(token, key);
    }

    /**
     * 测试待安装的自定义 API Key 是否可用（不落库）
     * 前端在“测试并安装”时先调用本接口，通过后才 PUT 保存并播放安装成功过场
     */
    @PostMapping("api-key/test")
    public Result testApiKey(@RequestHeader("Authorization") String token,
                             @RequestBody java.util.Map<String, String> body) {
        String key = (body == null) ? null : body.get("apiKey");
        String model = (body == null) ? null : body.get("model");
        return sysUserService.testApiKey(token, key, model);
    }

    /**
     * 查询当前用户的 API Key 配置状态（安全：只返回布尔，不返回明文）
     */
    @GetMapping("api-key")
    public Result getApiKeyStatus(@RequestHeader("Authorization") String token) {
        return sysUserService.apiKeyStatus(token);
    }
}
