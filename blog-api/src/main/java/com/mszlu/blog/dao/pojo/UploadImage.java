package com.mszlu.blog.dao.pojo;

import lombok.Data;

/**
 * 文章图片持久化存储。
 * 线上容器磁盘是临时的（重启/重新部署即清空），落盘会导致图片 404，
 * 因此图片内容统一存到数据库，由 /images/{id} 读取。
 */
@Data
public class UploadImage {

    private String id;

    private String contentType;

    private byte[] data;

    private Long createDate;
}
