package com.mszlu.blog.dao.pojo;


import lombok.Data;

@Data
public class Article {

        public static final int Article_TOP = 1;

        public static final int Article_Common = 0;

        private String id;

        private String title;

        private String summary;

        private int commentCounts;

        private int viewCounts;

        /**
         * 作者id
         */
        private String authorId;
        /**
         * 内容id
         */
        private String bodyId;
        /**
         *类别id
         */
        private String categoryId;

        /**
         * 置顶
         */
        private int weight = Article_Common;


        /**
         * 创建时间
         */
        private Long createDate;
    }

