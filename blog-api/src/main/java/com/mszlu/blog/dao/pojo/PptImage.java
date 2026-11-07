package com.mszlu.blog.dao.pojo;

import com.baomidou.mybatisplus.annotation.TableField;
import lombok.Data;

/**
 * PPT AI 配图持久化。
 * 生图供应商的 URL 时效很短（硅基流动 1 小时），必须落库，由 /ppt/image/{id} 长期提供。
 */
@Data
public class PptImage {

    private String id;

    private String mime;

    private byte[] data;

    @TableField("created_at")
    private Long createdAt;
}
