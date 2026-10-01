package com.mszlu.blog.vo.params;

import lombok.Data;

/**
 * 个性签名更新请求体
 */
@Data
public class SignatureParam {

    /** 签名内容；传 null 或空串表示清空，最长 30 字 */
    private String signature;
}
