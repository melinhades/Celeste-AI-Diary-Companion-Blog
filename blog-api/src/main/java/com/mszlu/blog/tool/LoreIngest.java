package com.mszlu.blog.tool;

import com.alibaba.fastjson.JSON;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mszlu.blog.dao.mapper.DocumentChunkMapper;
import com.mszlu.blog.dao.pojo.DocumentChunk;
import com.mszlu.blog.service.ai.AiClient;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.io.Resource;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;
import org.springframework.stereotype.Component;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Celeste 设定知识库灌库小工具。
 * 用法：mvn spring-boot:run -Dspring-boot.run.arguments=--ingest-lore
 *
 * 扫描 classpath:lore/*.md，每篇 md：
 *   第一行  # 标题
 *   第二行  > refId: WikiPageName
 *   正文按段落（双换行）切，过短的并入下一段，过长的再按句子细切，
 *   每片调 AiClient.embed 向量化后入库（userId=null, source=lore）。
 * 同 refId 旧片先删后插，可重复运行。
 */
@Component
@Slf4j
public class LoreIngest implements CommandLineRunner {

    @Autowired
    private AiClient aiClient;
    @Autowired
    private DocumentChunkMapper chunkMapper;

    private static final Pattern TITLE_LINE = Pattern.compile("^#\\s+(.+)$");
    private static final Pattern REFID_LINE = Pattern.compile("^>\\s*refId:\\s*(\\S+)\\s*$");

    /** 单片最短/最长字数 */
    private static final int PIECE_MIN = 60;
    private static final int PIECE_MAX = 250;
    private static final int PIECE_SOFT = 110;

    /** 句子切分（中英句末标点 + 换行） */
    private static final Pattern SENTENCE = Pattern.compile("[^。！？!?\\.\\n]+[。！？!?\\.]?");

    @Override
    public void run(String... args) {
        if (args == null || args.length == 0 || !Arrays.asList(args).contains("--ingest-lore")) {
            return;
        }
        long start = System.currentTimeMillis();
        int pageOk = 0, pageFail = 0, chunkOk = 0, chunkFail = 0;

        Resource[] resources;
        try {
            resources = new PathMatchingResourcePatternResolver()
                    .getResources("classpath*:lore/**/*.md");
        } catch (Exception e) {
            log.error("未找到 lore 资源目录", e);
            System.exit(1);
            return;
        }
        if (resources.length == 0) {
            log.warn("classpath:lore/ 下没有任何 .md 文件，直接退出");
            System.exit(0);
            return;
        }

        log.info("开始灌库，共 {} 个 markdown 文件", resources.length);
        for (Resource res : resources) {
            try {
                int n = ingestOne(res);
                if (n < 0) {
                    pageFail++;
                    log.warn("跳过（解析失败）：{}", res.getFilename());
                } else {
                    pageOk++;
                    chunkOk += n;
                    log.info("[{}] 切片入库 {} 条", res.getFilename(), n);
                }
            } catch (Exception e) {
                pageFail++;
                log.error("处理 {} 失败", res.getFilename(), e);
            }
        }

        long cost = (System.currentTimeMillis() - start) / 1000;
        log.info("灌库完成：成功页面 {}，失败 {}，入库分片 {}（失败 {}），耗时 {}s",
                pageOk, pageFail, chunkOk, chunkFail, cost);
        System.exit(0);
    }

    /**
     * 处理一个 md 文件，返回入库片数；解析失败返回 -1。
     */
    private int ingestOne(Resource res) throws Exception {
        List<String> lines;
        try (BufferedReader reader = new BufferedReader(
                new InputStreamReader(res.getInputStream(), StandardCharsets.UTF_8))) {
            lines = new ArrayList<>();
            String line;
            while ((line = reader.readLine()) != null) lines.add(line);
        }
        if (lines.isEmpty()) return -1;

        String title = null;
        String refId = null;
        int i = 0;
        // 解析元数据：第一个 # 行作 title，紧邻的 > refId: 行作 refId
        while (i < lines.size()) {
            String trimmed = lines.get(i).trim();
            if (trimmed.isEmpty()) { i++; continue; }
            Matcher tm = TITLE_LINE.matcher(trimmed);
            if (tm.matches()) {
                title = tm.group(1).trim();
                i++;
                // 找紧邻的 refId 行
                while (i < lines.size() && lines.get(i).trim().isEmpty()) i++;
                if (i < lines.size()) {
                    Matcher rm = REFID_LINE.matcher(lines.get(i).trim());
                    if (rm.matches()) {
                        refId = rm.group(1).trim();
                        i++;
                    }
                }
                break;
            }
            // 没找到 # 标题前先跳过 > refId（不合规）
            i++;
        }
        if (title == null || refId == null) {
            log.warn("缺少标题或 refId：{}", res.getFilename());
            return -1;
        }

        // 剩余行作为正文
        StringBuilder body = new StringBuilder();
        for (int j = i; j < lines.size(); j++) {
            body.append(lines.get(j)).append('\n');
        }
        List<String> pieces = splitPieces(body.toString());
        if (pieces.isEmpty()) {
            log.warn("[{}] 正文为空", res.getFilename());
            return -1;
        }

        // 删旧
        LambdaQueryWrapper<DocumentChunk> del = new LambdaQueryWrapper<>();
        del.isNull(DocumentChunk::getUserId)
          .eq(DocumentChunk::getSource, "lore")
          .eq(DocumentChunk::getRefId, refId);
        chunkMapper.delete(del);

        // 插新
        int inserted = 0;
        long now = System.currentTimeMillis();
        for (String piece : pieces) {
            String fullForEmbed = title + ": " + piece;
            float[] vec = aiClient.embed(fullForEmbed);
            if (vec == null) {
                log.warn("向量化为空，跳过该片：{}", piece.substring(0, Math.min(40, piece.length())));
                continue;
            }
            DocumentChunk c = new DocumentChunk();
            c.setUserId(null);
            c.setSource("lore");
            c.setRefId(refId);
            c.setTitle(title);
            c.setContent(piece);
            c.setEmbedding(JSON.toJSONString(vec));
            c.setCreateDate(now);
            chunkMapper.insert(c);
            inserted++;
        }
        return inserted;
    }

    /**
     * 按段落（双换行）切，过短并入下一段，过长再按句子贪心攒到 60~110。
     */
    private List<String> splitPieces(String text) {
        String[] paragraphs = text.split("\\n\\s*\\n");
        List<String> pieces = new ArrayList<>();
        StringBuilder buf = new StringBuilder();
        for (String p0 : paragraphs) {
            String p = p0.trim();
            if (p.isEmpty()) continue;
            // 单段过长先按句子再切
            if (p.length() > PIECE_MAX) {
                if (buf.length() >= PIECE_MIN) {
                    pieces.add(buf.toString());
                    buf.setLength(0);
                } else if (buf.length() > 0) {
                    buf.append('\n');
                }
                for (String s : sliceLongParagraph(p)) {
                    if (buf.length() > 0 && buf.length() + s.length() > PIECE_SOFT) {
                        pieces.add(buf.toString());
                        buf.setLength(0);
                    }
                    buf.append(s);
                    if (buf.length() >= PIECE_SOFT) {
                        pieces.add(buf.toString());
                        buf.setLength(0);
                    }
                }
                continue;
            }
            // 短段：攒着
            if (buf.length() > 0 && buf.length() + p.length() > PIECE_SOFT) {
                pieces.add(buf.toString());
                buf.setLength(0);
            }
            buf.append(p);
            if (buf.length() >= PIECE_SOFT) {
                pieces.add(buf.toString());
                buf.setLength(0);
            }
        }
        if (buf.length() >= PIECE_MIN) {
            pieces.add(buf.toString());
        } else if (buf.length() > 0 && !pieces.isEmpty()) {
            // 末尾太短并到上一片
            int last = pieces.size() - 1;
            pieces.set(last, pieces.get(last) + "\n" + buf.toString());
        } else if (buf.length() > 0) {
            pieces.add(buf.toString());
        }
        return pieces;
    }

    /** 长段按句子切，返回句子列表 */
    private List<String> sliceLongParagraph(String p) {
        List<String> out = new ArrayList<>();
        Matcher m = SENTENCE.matcher(p);
        while (m.find()) {
            String s = m.group().trim();
            if (!s.isEmpty()) out.add(s);
        }
        return out;
    }
}
