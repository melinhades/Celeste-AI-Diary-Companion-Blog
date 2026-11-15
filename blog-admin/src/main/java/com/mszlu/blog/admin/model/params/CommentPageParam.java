package com.mszlu.blog.admin.model.params;

import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode(callSuper = true)
public class CommentPageParam extends PageParam {

    private Long articleId;
}
