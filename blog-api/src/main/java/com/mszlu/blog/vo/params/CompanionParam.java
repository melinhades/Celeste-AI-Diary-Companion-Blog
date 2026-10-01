package com.mszlu.blog.vo.params;

import lombok.Data;

/**
 * 日记伴侣请求体：根据草稿片段获得 Madeline 的反馈
 */
@Data
public class CompanionParam {

    /** 正在写的日记草稿片段 */
    private String draft;
}
