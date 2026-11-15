package com.mszlu.blog.admin.pojo;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

@Data
@TableName("ms_document_chunk")
public class DocumentChunk {

    @TableId(type = IdType.INPUT)
    private String id;

    private String userId;

    private String source;

    private String refId;

    private String title;

    private String content;

    private String embedding;

    private Long createDate;
}
