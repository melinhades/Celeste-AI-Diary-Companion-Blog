package com.mszlu.blog.controller;

import com.mszlu.blog.dao.pojo.UploadImage;
import com.mszlu.blog.service.UploadImageService;
import com.mszlu.blog.utils.R2Utils;
import com.mszlu.blog.vo.Result;
import lombok.extern.slf4j.Slf4j;
import org.apache.commons.lang3.StringUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.InputStream;
import java.util.Arrays;
import java.util.List;
import java.util.UUID;

@RestController
@Slf4j
@RequestMapping("upload")
public class UploadController {

    @Autowired
    private UploadImageService uploadImageService;

    @Autowired
    private R2Utils r2Utils;

    private static final List<String> ALLOWED_EXTENSIONS = Arrays.asList("png", "jpg", "jpeg", "gif", "webp");
    private static final List<String> ALLOWED_MIME_TYPES = Arrays.asList(
            "image/png", "image/jpeg", "image/gif", "image/webp"
    );
    private static final long MAX_FILE_SIZE = 8 * 1024 * 1024; // 8MB

    // 文件头魔数校验
    private static final List<byte[]> MAGIC_NUMBERS = Arrays.asList(
            new byte[]{(byte) 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A}, // PNG
            new byte[]{(byte) 0xFF, (byte) 0xD8, (byte) 0xFF}, // JPEG
            new byte[]{0x47, 0x49, 0x46, 0x38}, // GIF87a / GIF89a
            new byte[]{0x52, 0x49, 0x46, 0x46}  // WEBP (RIFF header)
    );

    @PostMapping
    public Result upload(@RequestParam("image") MultipartFile file) {
        if (file == null || file.isEmpty()) return Result.fail(20001, "文件为空");

        String originalFilename = file.getOriginalFilename();
        String ext = StringUtils.substringAfterLast(originalFilename, ".");
        if (ext == null || !ALLOWED_EXTENSIONS.contains(ext.toLowerCase())) {
            return Result.fail(20001, "只支持图片（png/jpg/gif/webp）");
        }

        String contentType = file.getContentType();
        if (contentType == null || !ALLOWED_MIME_TYPES.contains(contentType.toLowerCase())) {
            return Result.fail(20001, "不支持的文件类型");
        }

        if (file.getSize() > MAX_FILE_SIZE) {
            return Result.fail(20001, "图片太大了（上限 8MB）");
        }

        // 魔数校验 - 读取文件头验证真实文件类型
        if (!validateMagicNumber(file)) {
            return Result.fail(20001, "文件内容与扩展名不匹配，疑似恶意文件");
        }

        try {
            byte[] bytes = file.getBytes();
            // 优先写 R2（对象存储，与 Cloudflare 同生态、零出口流量费）；
            // 未启用或写入失败则回退数据库（历史图片与本地开发都走这条，零依赖）
            if (r2Utils.isEnabled()) {
                String r2Id = UUID.randomUUID().toString().replace("-", "");
                if (r2Utils.put(r2Id, contentType.toLowerCase(), bytes)) {
                    return Result.success("/images/" + r2Id);
                }
                log.warn("R2 写入失败，回退数据库存储, file:{}", originalFilename);
            }
            // 存数据库而不是容器磁盘：线上磁盘是临时的，重启/重新部署后文件会丢失导致 404
            UploadImage image = new UploadImage();
            image.setContentType(contentType.toLowerCase());
            image.setData(bytes);
            image.setCreateDate(System.currentTimeMillis());
            String id = uploadImageService.save(image);
            return Result.success("/images/" + id);
        } catch (Exception e) {
            log.error("图片上传失败, file:{}, size:{}KB, contentType:{}", originalFilename,
                    file.getSize() / 1024, contentType, e);
            return Result.fail(20001, "上传失败");
        }
    }

    private boolean validateMagicNumber(MultipartFile file) {
        try (InputStream is = file.getInputStream()) {
            byte[] header = new byte[12]; // 读取前 12 字节足以覆盖主流图片格式
            int read = is.read(header);
            if (read < 4) return false;

            for (byte[] magic : MAGIC_NUMBERS) {
                if (read >= magic.length && matchesMagicNumber(header, magic)) {
                    return true;
                }
            }
            return false;
        } catch (IOException e) {
            return false;
        }
    }

    private boolean matchesMagicNumber(byte[] header, byte[] magic) {
        if (header.length < magic.length) return false;
        for (int i = 0; i < magic.length; i++) {
            if (header[i] != magic[i]) return false;
        }
        // WEBP 特殊处理：RIFF 后面还需检查 "WEBP"
        if (magic[0] == 0x52 && magic[1] == 0x49 && magic[2] == 0x46 && magic[3] == 0x46) {
            return header.length >= 12 &&
                   header[8] == 0x57 && header[9] == 0x45 &&
                   header[10] == 0x42 && header[11] == 0x50;
        }
        return true;
    }
}
