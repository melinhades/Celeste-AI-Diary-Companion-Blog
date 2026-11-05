package com.mszlu.blog.controller;

import com.mszlu.blog.dao.mapper.UploadImageMapper;
import com.mszlu.blog.dao.pojo.UploadImage;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.concurrent.TimeUnit;

/**
 * 图片读取接口：上传内容存数据库，返回时按原始 Content-Type 输出。
 * 公开访问（不在登录拦截器路径内），id 为随机 UUID，不可枚举。
 */
@RestController
@RequestMapping("images")
public class ImageController {

    @Autowired
    private UploadImageMapper uploadImageMapper;

    @GetMapping("/{id}")
    public ResponseEntity<byte[]> get(@PathVariable("id") String id) {
        UploadImage image = uploadImageMapper.selectById(id);
        if (image == null || image.getData() == null || image.getData().length == 0) {
            return ResponseEntity.notFound().build();
        }
        MediaType mediaType;
        try {
            mediaType = MediaType.parseMediaType(image.getContentType());
        } catch (Exception e) {
            mediaType = MediaType.APPLICATION_OCTET_STREAM;
        }
        return ResponseEntity.ok()
                .contentType(mediaType)
                .cacheControl(CacheControl.maxAge(365, TimeUnit.DAYS).cachePublic())
                .body(image.getData());
    }
}
