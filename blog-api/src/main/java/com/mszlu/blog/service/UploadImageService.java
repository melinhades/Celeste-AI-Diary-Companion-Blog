package com.mszlu.blog.service;

import com.mszlu.blog.dao.pojo.UploadImage;

/**
 * 上传图片的持久化读写：内容存数据库，不落容器磁盘。
 */
public interface UploadImageService {

    /**
     * 保存图片内容，返回随机 id（用于 /images/{id} 访问）。
     */
    String save(UploadImage image);

    UploadImage findById(String id);
}
