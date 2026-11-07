package com.mszlu.blog.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.mszlu.blog.dao.mapper.SysUserMapper;
import com.mszlu.blog.dao.pojo.SysUser;
import com.mszlu.blog.service.SysUserService;
import com.mszlu.blog.service.TokenService;
import com.mszlu.blog.service.ai.AiClient;
import com.mszlu.blog.vo.LoginUserVo;
import com.mszlu.blog.vo.Result;
import com.mszlu.blog.vo.params.ErrorCode;
import com.mszlu.blog.vo.params.UserVo;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.BeanUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Service;

import java.util.concurrent.TimeUnit;

@Service
@Slf4j
public class SysUserServiceImpl implements SysUserService {

    private static final String SEED_CLAIM_KEY_PREFIX = "berry_seed_claim_";
    private static final long SEED_CLAIM_COOLDOWN_HOURS = 6;

    @Autowired
    private SysUserMapper sysUserMapper;
    @Autowired
    private TokenService tokenService;
    @Autowired
    private RedisTemplate<String, String> redisTemplate;
    @Autowired
    private AiClient aiClient;

    @Override
    public UserVo findUserVoById(String id) {
        SysUser sysUser = sysUserMapper.selectById(id);
        if (sysUser == null) {
            sysUser = new SysUser();
            sysUser.setId("1");
            sysUser.setAvatar("/static/img/logo.b3a48c0.png");
            sysUser.setNickname("贾凡玉玉");
        }
        UserVo userVo = new UserVo();
        BeanUtils.copyProperties(sysUser,userVo);
        userVo.setId(sysUser.getId());
        return userVo;
    }
    @Override
    public SysUser findUserById(String id) {
        SysUser sysUser = sysUserMapper.selectById(id);
        if (sysUser == null) {
            sysUser = new SysUser();
            sysUser.setNickname("贾凡玉玉");
        }
        return sysUser;
    }

    @Override
    public Result findUserByToken(String token) {
        SysUser sysUser = tokenService.checkToken(token);
        if (sysUser == null) {
            return Result.fail(ErrorCode.TOKEN_ERROR.getCode(), ErrorCode.TOKEN_ERROR.getMsg());
        }
        LoginUserVo loginUserVo = new LoginUserVo();
        BeanUtils.copyProperties(sysUser, loginUserVo);
        return Result.success(loginUserVo);
    }
    @Override
    public SysUser findUserByAccount(String account){

    LambdaQueryWrapper<SysUser> queryWrapper = new LambdaQueryWrapper<>();
    queryWrapper.eq(SysUser::getAccount,account);
    queryWrapper.last("limit 1");
    return this.sysUserMapper.selectOne(queryWrapper);
    }
    @Override
    public void save(SysUser sysUser){
        //保存用户 这id会自动生成
        // 默认生成的id是分布式id 雪花算法
        //mybatis-plus
        this.sysUserMapper.insert(sysUser);
    }
    @Override
    public void updateById(SysUser sysUser){
        this.sysUserMapper.updateById(sysUser);
    }

    @Override
    public Result berryBalance(String token) {
        SysUser loginUser = tokenService.checkToken(token);
        if (loginUser == null) {
            return Result.fail(ErrorCode.TOKEN_ERROR.getCode(), ErrorCode.TOKEN_ERROR.getMsg());
        }
        // 以库里的最新值为准（登录态缓存里的 berry 可能因他端变动而过期）
        SysUser fresh = sysUserMapper.selectById(loginUser.getId());
        if (fresh == null) {
            return Result.fail(ErrorCode.TOKEN_ERROR.getCode(), ErrorCode.TOKEN_ERROR.getMsg());
        }
        int berry = fresh.getBerry() == null ? 0 : fresh.getBerry();
        java.util.Map<String, Object> data = new java.util.HashMap<>();
        data.put("berry", berry);
        return Result.success(data);
    }

    @Override
    public void grantDiaryBerry(String userId) {
        if (userId == null || userId.isEmpty()) {
            return;
        }
        LambdaUpdateWrapper<SysUser> uw = new LambdaUpdateWrapper<>();
        uw.eq(SysUser::getId, userId);
        uw.setSql("berry = COALESCE(berry, 0) + 1");
        sysUserMapper.update(null, uw);
    }

    @Override
    public Result claimSeedBerry(String token) {
        SysUser loginUser = tokenService.checkToken(token);
        if (loginUser == null) {
            return Result.fail(ErrorCode.TOKEN_ERROR.getCode(), ErrorCode.TOKEN_ERROR.getMsg());
        }
        String key = SEED_CLAIM_KEY_PREFIX + loginUser.getId();
        Boolean firstClaim;
        try {
            firstClaim = redisTemplate.opsForValue()
                    .setIfAbsent(key, "1", SEED_CLAIM_COOLDOWN_HOURS, TimeUnit.HOURS);
        } catch (Exception e) {
            // 冷却状态无法确认时拒绝发放，绝不 fail-open
            log.warn("草莓籽领取冷却校验失败 userId={}", loginUser.getId(), e);
            return Result.fail(503, "奖励暂不可用，请稍后再试");
        }

        boolean granted = Boolean.TRUE.equals(firstClaim);
        if (granted) {
            LambdaUpdateWrapper<SysUser> uw = new LambdaUpdateWrapper<>();
            uw.eq(SysUser::getId, loginUser.getId());
            uw.setSql("berry = COALESCE(berry, 0) + 1");
            try {
                int rows = sysUserMapper.update(null, uw);
                if (rows == 0) {
                    deleteSeedClaimKey(key);
                    return Result.fail(400, "用户不存在");
                }
            } catch (Exception e) {
                log.warn("草莓籽奖励发放失败 userId={}", loginUser.getId(), e);
                deleteSeedClaimKey(key);
                return Result.fail(500, "奖励发放失败，请稍后再试");
            }
        }

        SysUser fresh = sysUserMapper.selectById(loginUser.getId());
        java.util.Map<String, Object> data = new java.util.HashMap<>();
        Integer berry = fresh == null ? null : fresh.getBerry();
        data.put("berry", berry == null ? Integer.valueOf(0) : berry);
        data.put("granted", granted);
        return Result.success(data);
    }

    /** 发放失败时尽力回滚冷却标记，失败只记日志不抛出 */
    private void deleteSeedClaimKey(String key) {
        try {
            redisTemplate.delete(key);
        } catch (Exception e) {
            log.warn("草莓籽冷却标记回滚失败 key={}", key, e);
        }
    }

    @Override
    public Result updateSignature(String token, String signature) {
        SysUser loginUser = tokenService.checkToken(token);
        if (loginUser == null) {
            return Result.fail(ErrorCode.TOKEN_ERROR.getCode(), ErrorCode.TOKEN_ERROR.getMsg());
        }
        String val = signature == null ? null : signature.trim();
        if (val != null && val.length() > 30) {
            val = val.substring(0, 30);
        }
        LambdaUpdateWrapper<SysUser> uw = new LambdaUpdateWrapper<>();
        uw.eq(SysUser::getId, loginUser.getId());
        uw.set(SysUser::getSignature, val == null || val.isEmpty() ? null : val);
        sysUserMapper.update(null, uw);

        SysUser fresh = sysUserMapper.selectById(loginUser.getId());
        tokenService.refreshUserCache(token, fresh);
        java.util.Map<String, Object> data = new java.util.HashMap<>();
        data.put("signature", fresh.getSignature());
        return Result.success(data);
    }

    /** 设置或清空用户自定义 AI API Key。空串/null → 清空回退系统默认 */
    public Result updateApiKey(String token, String apiKey) {
        SysUser loginUser = tokenService.checkToken(token);
        if (loginUser == null) {
            return Result.fail(ErrorCode.TOKEN_ERROR.getCode(), ErrorCode.TOKEN_ERROR.getMsg());
        }
        String val = apiKey == null ? null : apiKey.trim();
        if (val != null && val.length() > 128) val = val.substring(0, 128);
        // 128 上限：主流 AI 厂商 Key 都在 40~80 字符内，给 128 足够

        // 保存时探测服务商：Key 与 provider 一起落库，全局调用据此选择端点/模型
        String provider = null;
        if (val != null && !val.isEmpty()) {
            AiClient.KeyProbe probe = aiClient.probeKey(val);
            if (probe.error != null) {
                return Result.fail(ErrorCode.PARAMS_ERROR.getCode(), probe.error);
            }
            provider = probe.provider;
        }

        LambdaUpdateWrapper<SysUser> uw = new LambdaUpdateWrapper<>();
        uw.eq(SysUser::getId, loginUser.getId());
        uw.set(SysUser::getApiKey, (val == null || val.isEmpty()) ? null : val);
        uw.set(SysUser::getApiProvider, provider);
        sysUserMapper.update(null, uw);

        SysUser fresh = sysUserMapper.selectById(loginUser.getId());
        tokenService.refreshUserCache(token, fresh);

        java.util.Map<String, Object> data = new java.util.HashMap<>();
        data.put("hasApiKey", fresh.getApiKey() != null && !fresh.getApiKey().isEmpty());
        return Result.success(data);
    }

    /** 用待安装的 Key 做一次上游探测，成功后前端才保存并播放安装动画；附带可用模型列表供挑选 */
    @Override
    public Result testApiKey(String token, String apiKey, String model) {
        SysUser loginUser = tokenService.checkToken(token);
        if (loginUser == null) {
            return Result.fail(ErrorCode.TOKEN_ERROR.getCode(), ErrorCode.TOKEN_ERROR.getMsg());
        }
        String val = apiKey == null ? null : apiKey.trim();
        if (val == null || val.isEmpty()) {
            return Result.fail(ErrorCode.PARAMS_ERROR.getCode(), "请先填入 API Key");
        }
        if (val.length() > 128) {
            return Result.fail(ErrorCode.PARAMS_ERROR.getCode(), "API Key 过长");
        }
        String m = model == null ? null : model.trim();
        java.util.Map<String, Object> data = new java.util.HashMap<>();
        if (m != null && !m.isEmpty()) {
            // 指定模型探测：provider 取已落库的（Key 已保存），取不到再现场探测
            SysUser fresh = sysUserMapper.selectById(loginUser.getId());
            String provider = fresh == null ? null : fresh.getApiProvider();
            if (provider == null || provider.isEmpty()) {
                AiClient.KeyProbe probe = aiClient.probeKey(val);
                if (probe.error != null) {
                    return Result.fail(ErrorCode.PARAMS_ERROR.getCode(), probe.error);
                }
                provider = probe.provider;
            }
            String err = aiClient.testKeyModel(val, provider, m);
            if (err != null) {
                return Result.fail(ErrorCode.PARAMS_ERROR.getCode(), err);
            }
            data.put("hasApiKey", true);
            return Result.success(data);
        }
        AiClient.KeyProbe probe = aiClient.probeKey(val);
        if (probe.error != null) {
            return Result.fail(ErrorCode.PARAMS_ERROR.getCode(), probe.error);
        }
        data.put("hasApiKey", true);
        data.put("provider", probe.provider);
        data.put("models", aiClient.listModels(val, probe.provider));
        return Result.success(data);
    }

    /** 查询当前用户 API Key 配置状态（只返回布尔，不返回明文） */
    public Result apiKeyStatus(String token) {
        SysUser loginUser = tokenService.checkToken(token);
        if (loginUser == null) {
            return Result.fail(ErrorCode.TOKEN_ERROR.getCode(), ErrorCode.TOKEN_ERROR.getMsg());
        }
        SysUser fresh = sysUserMapper.selectById(loginUser.getId());
        boolean has = fresh.getApiKey() != null && !fresh.getApiKey().trim().isEmpty();
        java.util.Map<String, Object> data = new java.util.HashMap<>();
        data.put("hasApiKey", has);
        return Result.success(data);
    }
}