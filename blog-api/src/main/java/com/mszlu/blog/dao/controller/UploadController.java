package com.mszlu.blog.dao.controller;

import com.mszlu.blog.utils.QiniuUtils;
import com.mszlu.blog.vo.Result;
import org.apache.commons.lang3.StringUtils;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.util.Arrays;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("upload")
public class UploadController {

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
            File dir = new File(System.getProperty("user.dir"), "uploads");
            if (!dir.exists()) dir.mkdirs();
            String fileName = UUID.randomUUID().toString().replace("-", "") + "." + ext;
            file.transferTo(new File(dir, fileName));
            return Result.success("/uploads/" + fileName);
        } catch (Exception e) {
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
