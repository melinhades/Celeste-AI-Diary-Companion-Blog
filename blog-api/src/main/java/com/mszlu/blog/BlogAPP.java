package com.mszlu.blog;

import org.mybatis.spring.annotation.MapperScan;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
@MapperScan("com.mszlu.blog.dao.mapper")
public class BlogAPP {
    public static void main(String[] args) {
        SpringApplication.run(BlogAPP.class, args);
    }
}
