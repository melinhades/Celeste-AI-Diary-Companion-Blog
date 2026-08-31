package com.mszlu.blog.dao.pojo;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import lombok.Data;

@Data
public class Memory {

    @TableId(type = IdType.ASSIGN_ID)
    private String id;

    private String userId;

    /** 一条记忆："用户在等甲方的尾款，很焦虑" */
    private String content;

    /** event / emotion / relationship / promise */
    private String type;

    /** open=未完结, resolved=已了结 */
    private String status;

    /** 1-10 */
    private Integer importance;

    /** 上次被拼进 prompt 的时间戳 */
    private Long lastMentionedTime;

    /** 内容向量（JSON 数组字符串），RAG 语义检索用 */
    private String embedding;

    private Long createDate;
}
