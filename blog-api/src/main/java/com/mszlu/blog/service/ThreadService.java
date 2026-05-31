package com.mszlu.blog.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mszlu.blog.dao.mapper.ArticleMapper;
import com.mszlu.blog.dao.pojo.Article;
import com.mszlu.blog.vo.params.ArticleVo;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;

@Component
public class ThreadService {
    //期望此操作在线程池执行 不会影响原有的主线程
    @Async("taskExecutor")
    public void updateArticleViewCount(ArticleMapper articleMapper, Article article){
        int viewCounts = article.getViewCounts();
        Article articleUpdate = new Article();
        articleUpdate.setViewCounts(viewCounts + 1);
        LambdaQueryWrapper<Article> updateWrapper = new LambdaQueryWrapper<>();
        updateWrapper.eq(Article::getId, article.getId());
        //设置一个为了在多线程环境下 线程安全
        updateWrapper.eq(Article::getViewCounts, viewCounts);
        //update article set view_count=100 where view_count=00 and id=11

        articleMapper.update(articleUpdate,updateWrapper);

        try{
            Thread.sleep(5000);

            System.out.println("更新完成了....");

        }catch(InterruptedException e){
            e.printStackTrace();
        }
    }
}
