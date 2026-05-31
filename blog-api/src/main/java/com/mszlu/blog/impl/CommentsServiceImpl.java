package com.mszlu.blog.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mszlu.blog.dao.mapper.CommentsMapper;
import com.mszlu.blog.dao.pojo.Comment;
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
        String parent = commentParam.getParent();
        if (parent == null || "0".equals(parent)) {
            comment.setLevel(1);
        }else{
            comment.setLevel(2);
        }
        comment.setParentId(parent == null ? "0" : parent);
        String toUserId = commentParam.getToUserId();
        comment.setToUid(toUserId == null ? "0" : toUserId);
        this.commentsMapper.insert(comment);
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
        //作者信息
        String authorId=comment.getAuthorId();
        UserVo userVo = this.sysUserService.findUserVoById(authorId);
        commentVo.setAuthor(userVo);
        //子评论
        Integer level =comment.getLevel();
        if(1 == level) {
            String id = comment.getId();
            List<CommentVo> commentVoList = findCommentsByParentId(id);
            commentVo.setChildrens(commentVoList);
        }
        //to User给谁评论
        if(level>1){
            String toUid = comment.getToUid();
            UserVo toUserVo = this.sysUserService.findUserVoById(toUid);
            commentVo.setToUser(toUserVo);
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








