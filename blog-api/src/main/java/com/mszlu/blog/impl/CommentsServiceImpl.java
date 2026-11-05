package com.mszlu.blog.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mszlu.blog.dao.mapper.ArticleMapper;
import com.mszlu.blog.dao.mapper.CommentsMapper;
import com.mszlu.blog.dao.mapper.NotificationMapper;
import com.mszlu.blog.dao.pojo.Article;
import com.mszlu.blog.dao.pojo.Comment;
import com.mszlu.blog.dao.pojo.Notification;
import com.mszlu.blog.dao.pojo.SysUser;
import com.mszlu.blog.service.CommentsService;
import com.mszlu.blog.service.SysUserService;
import com.mszlu.blog.utils.UserThreadLocal;
import com.mszlu.blog.vo.Result;
import com.mszlu.blog.vo.params.CommentParam;
import com.mszlu.blog.vo.params.CommentVo;
import com.mszlu.blog.vo.params.UserVo;
import org.springframework.beans.BeanUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;

@Service
public class CommentsServiceImpl implements CommentsService {
    @Autowired
    private CommentsMapper commentsMapper;
    @Autowired
    private SysUserService sysUserService;
    @Autowired
    private ArticleMapper articleMapper;
    @Autowired
    private NotificationMapper notificationMapper;

    @Override
    public Result commentsByArticleId(String id) {
        /**
         * 1.根据文章id 查询 评论列表 从 comment表中查询
         * 2.根据作者的id 查询作者的信息
         * 3.判断 如果 level=1 要去查询它有没有子评论
         * 4.如果有 根据评论id进行查询(parent_id)
         */
        LambdaQueryWrapper<Comment> queryWrapper = new LambdaQueryWrapper<>();
        queryWrapper.eq(Comment::getArticleId, id);
        queryWrapper.eq(Comment::getLevel,1);
        List<Comment> comments = commentsMapper.selectList(queryWrapper);
        List<CommentVo>  commentVoList = copyList(comments);
        return Result.success(commentVoList);

    }
    @Override
    public Result comment(CommentParam commentParam){
        SysUser sysUser = UserThreadLocal.get();
        Comment comment = new Comment();
        comment.setArticleId(commentParam.getArticleId());
        comment.setAuthorId(sysUser.getId());
        comment.setContent(commentParam.getContent());
        comment.setCreateDate(System.currentTimeMillis());
        // 与文章发表一致：不传/null 当非匿名
        boolean anonymous = Boolean.TRUE.equals(commentParam.getAnonymous());
        comment.setAnonymous(anonymous ? 1 : 0);
        String parent = commentParam.getParent();
        if (parent == null || "0".equals(parent)) {
            comment.setLevel(1);
        }else{
            comment.setLevel(2);
        }
        comment.setParentId(parent == null ? "0" : parent);
        String toUserId = commentParam.getToUserId();
        // 匿名评论不下发 author.id，前端回复他人时 toUserId 会是空串，一并归一成 "0"
        if (toUserId == null || toUserId.isBlank()) {
            toUserId = "0";
        }
        comment.setToUid(toUserId);
        this.commentsMapper.insert(comment);

        String receiverId;
        if (comment.getLevel() == 2 && !"0".equals(toUserId)) {
            receiverId = toUserId;
        } else {
            Article article = articleMapper.selectById(commentParam.getArticleId());
            receiverId = article != null ? article.getAuthorId() : null;
        }
        if (receiverId != null && !receiverId.equals(sysUser.getId())) {
            Notification n = new Notification();
            n.setUserId(receiverId);
            n.setFromUserId(sysUser.getId());
            n.setArticleId(commentParam.getArticleId());
            n.setType("comment");
            n.setIsRead(0);
            n.setCreateDate(System.currentTimeMillis());
            // fromUserId 仍存真实 id（自用去重、后台统计要用），靠这个标记在列表页遮住昵称
            n.setAnonymous(anonymous ? 1 : 0);
            notificationMapper.insert(n);
        }
        return Result.success(null);
    }

    private List<CommentVo> copyList(List<Comment> comments){
        List<CommentVo> commentVoList = new ArrayList<>();
        for(Comment comment: comments){
            commentVoList.add(copy(comment));
        }
        return commentVoList;
    }
    private CommentVo copy(Comment comment){
        CommentVo commentVo = new CommentVo();
        BeanUtils.copyProperties(comment,commentVo);
        commentVo.setId(comment.getId());
        //历史评论没有该字段值时按非匿名处理
        if (comment.getAnonymous() == null) {
            commentVo.setAnonymous(0);
        }
        //作者信息：匿名评论不下发 author（昵称连同 id 一起藏在接口里会泄身份），也不费那次查库
        boolean anonymous = comment.getAnonymous() != null && comment.getAnonymous() == 1;
        if (!anonymous) {
            UserVo userVo = this.sysUserService.findUserVoById(comment.getAuthorId());
            commentVo.setAuthor(userVo);
        }
        //子评论
        Integer level =comment.getLevel();
        if(1 == level) {
            String id = comment.getId();
            List<CommentVo> commentVoList = findCommentsByParentId(id);
            commentVo.setChildrens(commentVoList);
        }
        //to User给谁评论：匿名行的 author.id 从不对外下发，拿不到 id 就回不到匿名者身上，所以这里直接解析不会反过来泄露身份
        if(level>1){
            String toUid = comment.getToUid();
            if (toUid != null && !"0".equals(toUid)) {
                UserVo toUserVo = this.sysUserService.findUserVoById(toUid);
                commentVo.setToUser(toUserVo);
            }
        }
        return commentVo;
    }
    private List<CommentVo> findCommentsByParentId(String id){
        LambdaQueryWrapper<Comment> queryWrapper = new LambdaQueryWrapper<>();
        queryWrapper.eq(Comment::getParentId,id);
        queryWrapper.eq(Comment::getLevel,2);
        return copyList(commentsMapper.selectList(queryWrapper));
    }
}








