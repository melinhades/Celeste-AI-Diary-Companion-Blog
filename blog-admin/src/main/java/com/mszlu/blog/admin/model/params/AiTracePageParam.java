package com.mszlu.blog.admin.model.params;

import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode(callSuper = true)
public class AiTracePageParam extends PageParam {

    private String scene;

    private String status;

    private String userId;

    /** 只查最近 N 天，默认 7 */
    private Integer days;
}
