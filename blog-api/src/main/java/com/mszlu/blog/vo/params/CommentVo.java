package com.mszlu.blog.vo.params;

import com.fasterxml.jackson.databind.annotation.JsonSerialize;
import com.fasterxml.jackson.databind.ser.std.ToStringSerializer;
import com.mszlu.blog.dao.pojo.SysUser;
import lombok.Data;

import java.util.List;

@Data
public class CommentVo  {
    //防止前端精度损失，把id转为String
    //分布式id比较长，传到前端会有精度损失，必须转为String类型，进行传输，就不会有问题了
    private String id;

    private UserVo author;

    private String content;

    private List<CommentVo> childrens;

    private String createDate;

    private Integer level;

    private UserVo toUser;
}