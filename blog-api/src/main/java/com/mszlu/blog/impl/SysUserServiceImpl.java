package com.mszlu.blog.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.mszlu.blog.dao.mapper.SysUserMapper;
import com.mszlu.blog.dao.pojo.SysUser;
import com.mszlu.blog.service.LoginService;
import com.mszlu.blog.service.SysUserService;
import com.mszlu.blog.vo.LoginUserVo;
import com.mszlu.blog.vo.Result;
import com.mszlu.blog.vo.params.ErrorCode;
import com.mszlu.blog.vo.params.UserVo;
import org.springframework.beans.BeanUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

@Service
public class SysUserServiceImpl implements SysUserService {
    @Autowired
    private SysUserMapper sysUserMapper;
    @Autowired
    private LoginService loginService;

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
    public SysUser findUser(String account, String password) {
        LambdaQueryWrapper<SysUser> queryWrapper = new LambdaQueryWrapper<>();
        queryWrapper.eq(SysUser::getAccount, account);
        queryWrapper.eq(SysUser::getPassword, password);
        queryWrapper.last("limit 1");
        return sysUserMapper.selectOne(queryWrapper);
    }

    @Override
    public Result findUserByToken(String token) {
        SysUser sysUser = loginService.checkToken(token);
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
        SysUser loginUser = loginService.checkToken(token);
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
    public Result adjustBerry(String token, Integer delta) {
        SysUser loginUser = loginService.checkToken(token);
        if (loginUser == null) {
            return Result.fail(ErrorCode.TOKEN_ERROR.getCode(), ErrorCode.TOKEN_ERROR.getMsg());
        }
        if (delta == null || delta == 0) {
            return Result.fail(400, "delta 非法");
        }
        if (Math.abs(delta) > 100000) {
            return Result.fail(400, "delta 超出范围");
        }
        // 数据库原子增减，GREATEST 兜底保证余额永不为负
        LambdaUpdateWrapper<SysUser> uw = new LambdaUpdateWrapper<>();
        uw.eq(SysUser::getId, loginUser.getId());
        uw.setSql("berry = GREATEST(COALESCE(berry, 0) + " + delta + ", 0)");
        sysUserMapper.update(null, uw);

        SysUser fresh = sysUserMapper.selectById(loginUser.getId());
        loginService.refreshUserCache(token, fresh);
        java.util.Map<String, Object> data = new java.util.HashMap<>();
        data.put("berry", fresh.getBerry() == null ? 0 : fresh.getBerry());
        return Result.success(data);
    }

    @Override
    public Result updateSignature(String token, String signature) {
        SysUser loginUser = loginService.checkToken(token);
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
        loginService.refreshUserCache(token, fresh);
        java.util.Map<String, Object> data = new java.util.HashMap<>();
        data.put("signature", fresh.getSignature());
        return Result.success(data);
    }
}