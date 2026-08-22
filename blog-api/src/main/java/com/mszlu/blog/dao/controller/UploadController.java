package com.mszlu.blog.dao.controller;

import com.mszlu.blog.utils.QiniuUtils;
import com.mszlu.blog.vo.Result;
import org.apache.commons.lang3.StringUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.io.File;
import java.util.Arrays;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("upload")
public class UploadController {

    private static final List<String> ALLOWED = Arrays.asList("png", "jpg", "jpeg", "gif", "webp");

    @PostMapping
    public Result upload(@RequestParam("image") MultipartFile file) {
        if (file == null || file.isEmpty()) return Result.fail(20001, "文件为空");
        String originalFilename = file.getOriginalFilename();
        String ext = StringUtils.substringAfterLast(originalFilename, ".");
        if (ext == null || !ALLOWED.contains(ext.toLowerCase())) return Result.fail(20001, "只支持图片（png/jpg/gif/webp）");
        if (file.getSize() > 8 * 1024 * 1024) return Result.fail(20001, "图片太大了（上限 8MB）");
        try {
            File dir = new File(System.getProperty("user.dir"), "uploads");
            if (!dir.exists()) dir.mkdirs();
            String fileName = UUID.randomUUID().toString().replace("-", "") + "." + ext;
            file.transferTo(new File(dir, fileName));
            return Result.success("/uploads/" + fileName);
        } catch (Exception e) {
            return Result.fail(20001, "上传失败");
        }
    }
}
