package com.mszlu.blog.dao.pojo;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import lombok.Data;

@Data
public class DocumentChunk {

    @TableId(type = IdType.ASSIGN_ID)
    private String id;

    private String userId;

    /** diary */
    private String source;

    /** 日记ID（编辑重存时按它覆盖旧分片） */
    private String refId;

    private String title;

    private String content;

    private String embedding;

    private Long createDate;
}
