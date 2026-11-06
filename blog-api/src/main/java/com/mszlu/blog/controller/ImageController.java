package com.mszlu.blog.controller;

import com.mszlu.blog.dao.pojo.UploadImage;
import com.mszlu.blog.service.UploadImageService;
import com.mszlu.blog.utils.R2Utils;
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
 * 图片读取接口：优先从 R2 对象存储读取，未命中则回退数据库（历史图片）。
 * 公开访问（不在登录拦截器路径内），id 为随机 UUID，不可枚举。
 */
@RestController
@RequestMapping("images")
public class ImageController {

    @Autowired
    private UploadImageService uploadImageService;

    @Autowired
    private R2Utils r2Utils;

    @GetMapping("/{id}")
    public ResponseEntity<byte[]> get(@PathVariable("id") String id) {
        // 新图优先走 R2；不存在（旧图/未启用）再回退数据库
        if (r2Utils.isEnabled()) {
            R2Utils.Stored stored = r2Utils.get(id);
            if (stored != null && stored.data() != null && stored.data().length > 0) {
                return ResponseEntity.ok()
                        .contentType(parseMediaType(stored.contentType()))
                        .cacheControl(CacheControl.maxAge(365, TimeUnit.DAYS).cachePublic())
                        .body(stored.data());
            }
        }
        UploadImage image = uploadImageService.findById(id);
        if (image == null || image.getData() == null || image.getData().length == 0) {
            return ResponseEntity.notFound().build();
        }
        return ResponseEntity.ok()
                .contentType(parseMediaType(image.getContentType()))
                .cacheControl(CacheControl.maxAge(365, TimeUnit.DAYS).cachePublic())
                .body(image.getData());
    }

    private MediaType parseMediaType(String contentType) {
        try {
            return MediaType.parseMediaType(contentType);
        } catch (Exception e) {
            return MediaType.APPLICATION_OCTET_STREAM;
        }
    }
}
