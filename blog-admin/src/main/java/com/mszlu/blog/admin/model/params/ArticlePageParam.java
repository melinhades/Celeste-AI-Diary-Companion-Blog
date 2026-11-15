package com.mszlu.blog.admin.model.params;

import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode(callSuper = true)
public class ArticlePageParam extends PageParam {

    private Long categoryId;

    private Integer visibility;
}
