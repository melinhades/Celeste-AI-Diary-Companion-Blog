package com.mszlu.blog.controller;

import com.mszlu.blog.dao.pojo.PptImage;
import com.mszlu.blog.service.PptImageService;
import com.mszlu.blog.service.PptService;
import com.mszlu.blog.vo.PptGenerateParam;
import com.mszlu.blog.vo.PptImageParam;
import com.mszlu.blog.vo.Result;
import org.apache.commons.lang3.StringUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;

import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.TimeUnit;

@RestController
@RequestMapping("ppt")
public class PptController {

    @Autowired
    private PptService pptService;

    @Autowired
    private PptImageService pptImageService;

    /** 6 页填字：返回 {slotId: text}，前端 buildSlides 直接消费 */
    @PostMapping("generate")
    public Result generate(@RequestBody PptGenerateParam param) {
        if (param == null || StringUtils.isBlank(param.getTopic())) {
            return Result.fail(20001, "topic 不能为空");
        }
        return Result.success(pptService.generate(param));
    }

    /** 单页配图：title+points → 画面描述 → Kolors → 下载落库，返回站内地址 {url} */
    @PostMapping("image")
    public Result image(@RequestBody PptImageParam param) {
        if (param == null || StringUtils.isBlank(param.getTitle())) {
            return Result.fail(20001, "title 不能为空");
        }
        String id = pptImageService.generate(param);
        if (StringUtils.isBlank(id)) {
            return Result.fail(20002, "图片生成失败");
        }
        Map<String, Object> data = new HashMap<>();
        data.put("url", ServletUriComponentsBuilder.fromCurrentContextPath()
                .path("/ppt/image/")
                .path(id)
                .toUriString());
        return Result.success(data);
    }

    /** 站内读图：图片写入后不再变化，可长缓存；Content-Type 按入库时记录的 mime 返回 */
    @GetMapping("image/{id}")
    public ResponseEntity<byte[]> image(@PathVariable String id) {
        PptImage image = pptImageService.find(id);
        if (image == null || image.getData() == null || image.getData().length == 0) {
            return ResponseEntity.notFound().build();
        }
        MediaType mediaType;
        try {
            mediaType = MediaType.parseMediaType(image.getMime());
        } catch (Exception e) {
            mediaType = MediaType.IMAGE_PNG;
        }
        return ResponseEntity.ok()
                .contentType(mediaType)
                .cacheControl(CacheControl.maxAge(365, TimeUnit.DAYS).cachePublic())
                .body(image.getData());
    }
}
