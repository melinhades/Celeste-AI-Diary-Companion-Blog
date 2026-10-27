package com.mszlu.blog.dao.pojo;


import lombok.Data;

@Data
public class Article {

        public static final int Article_TOP = 1;

        public static final int Article_Common = 0;

        /** 可见性：私密（仅作者可见） */
        public static final int VISIBILITY_PRIVATE = 0;

        /** 可见性：公开 */
        public static final int VISIBILITY_PUBLIC = 1;

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

        /**
         * 可见性：1=公开 0=私密
         */
        private Integer visibility;

        /**
         * 来源类型（当前仅 diary）
         */
        private String sourceType;

        /**
         * 来源 id（日记 id）
         */
        private String sourceId;
    }

