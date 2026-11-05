package com.mszlu.blog.impl;

import com.mszlu.blog.dao.mapper.UploadImageMapper;
import com.mszlu.blog.dao.pojo.UploadImage;
import com.mszlu.blog.service.UploadImageService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.UUID;

@Service
public class UploadImageServiceImpl implements UploadImageService {

    @Autowired
    private UploadImageMapper uploadImageMapper;

    @Override
    public String save(UploadImage image) {
        if (image.getId() == null) {
            image.setId(UUID.randomUUID().toString().replace("-", ""));
        }
        uploadImageMapper.insert(image);
        return image.getId();
    }

    @Override
    public UploadImage findById(String id) {
        return uploadImageMapper.selectById(id);
    }
}
