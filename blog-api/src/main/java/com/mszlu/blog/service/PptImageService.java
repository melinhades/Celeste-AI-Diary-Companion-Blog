package com.mszlu.blog.service;

import com.alibaba.fastjson.JSON;
import com.alibaba.fastjson.JSONArray;
import com.alibaba.fastjson.JSONObject;
import com.mszlu.blog.dao.mapper.PptImageMapper;
import com.mszlu.blog.dao.pojo.PptImage;
import com.mszlu.blog.service.ai.AiClient;
import com.mszlu.blog.service.ai.AiMessage;
import com.mszlu.blog.vo.PptImageParam;
import jakarta.annotation.PostConstruct;
import lombok.extern.slf4j.Slf4j;
import org.apache.commons.lang3.StringUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import javax.imageio.IIOImage;
import javax.imageio.ImageIO;
import javax.imageio.ImageWriteParam;
import javax.imageio.ImageWriter;
import javax.imageio.stream.ImageOutputStream;
import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.util.Collections;
import java.util.List;
import java.util.UUID;

/**
 * PPT 配图生成：标题+要点 → 生图提示词 → 生图供应商 → 下载 → 数据库。
 * 供应商 URL 时效很短（硅基流动仅 1 小时），所以必须先下载落库，再由 /ppt/image/{id} 长期提供。
 * 任何一步失败都返回 null，前端保留占位框，不影响播放。
 */
@Service
@Slf4j
public class PptImageService {

    /** 图片落库上限：超过则压缩，避免 LONGBLOB 把库撑大 */
    private static final long MAX_STORE_BYTES = 1536 * 1024;

    // ================== 生图供应商 ==================
    public enum ImageProvider { KOLORS, BIGMODEL, POLLINATIONS }

    /**
     * 唯一一处 provider 切换点：
     * POLLINATIONS = Pollinations 新 API（默认，吃参考图，人物跨页一致；需要 sk_ key，按张扣 pollen）
     * KOLORS       = 硅基流动 Kolors（保留，免费、国内直连、可关显式水印，但不吃参考图）
     * BIGMODEL     = 智谱 CogView-3-Flash（保留的旧实现，免费档会强制加「AI生成」水印）
     */
    private static final ImageProvider IMAGE_PROVIDER = ImageProvider.POLLINATIONS;

    private static final String KOLORS_BASE_URL = "https://api.siliconflow.cn/v1";
    private static final String KOLORS_MODEL = "Kwai-Kolors/Kolors";
    private static final String BIGMODEL_BASE_URL = "https://open.bigmodel.cn/api/paas/v4";
    private static final String BIGMODEL_MODEL = "cogview-3-flash";

    /** Pollinations 新 API（图生图入口；Classic 域的 image 参数会被静默忽略，不能用） */
    private static final String POLLINATIONS_BASE_URL = "https://gen.pollinations.ai";
    /** 0.005 pollen/张，10 张参考图，输出严格 1344×768；kontext-pro 0.03/张、只吃 1 张参考图 */
    private static final String POLLINATIONS_MODEL = "black-forest-labs/flux.2-klein-4b";

    @Autowired
    private AiClient aiClient;

    @Autowired
    private PptImageMapper pptImageMapper;

    @Value("${ai.image-base-url:}")
    private String imageBaseUrl;

    @Value("${ai.image-api-key:}")
    private String imageApiKey;

    @Value("${ai.image-model:}")
    private String imageModel;

    @Value("${ai.image-size:1344x768}")
    private String imageSize;

    @Value("${ai.image-read-timeout:60000}")
    private int imageReadTimeout;

    /** 参考图：公网 http(s) 地址优先（Pollinations 要求参考图可公网访问） */
    @Value("${ai.image-reference-url:}")
    private String imageReferenceUrl;

    /** 参考图本地路径；没有公网地址时读文件转 base64 data URI 再发（已实测 klein 可用） */
    @Value("${ai.image-reference-path:}")
    private String imageReferencePath;

    /** 固定种子：同一课件多页共用，配合参考图进一步压低画风/长相漂移；0 = 不传 */
    @Value("${ai.image-seed:0}")
    private int imageSeed;

    @Value("${ai.base-url:}")
    private String chatBaseUrl;

    @Value("${ai.api-key:}")
    private String chatApiKey;

    /** 硅基流动现有 Key（dev/local 配置），不新增密钥 */
    @Value("${siliconflow.api-key:}")
    private String siliconFlowKey;

    @Value("${ai.fast-api-key:}")
    private String fastApiKey;

    // ================== 画风 ==================
    /** 英语教材插图：扁平、干净、配色克制，一张图只讲一个动作（避免出现 textbook/English 字样，模型会照字画字母） */
    private static final String STYLE_TEXTBOOK =
            "flat vector editorial illustration, clean thin outlines, simple shapes, flat color fills, "
            + "restrained muted palette of soft teal, warm beige and pale coral, uncluttered background, "
            + "one clear action per image, calm teaching tone";

    /** 原版 Celeste 像素风（保留可选，随时切回） */
    private static final String STYLE_CELESTE =
            "celeste game style, flat 2D pixel art, low saturation, teal and purple snowy mountain, "
            + "clean composition, soft light, game screenshot";

    // 唯一一处画风切换点：TEXTBOOK（英语教材插画，默认）/ CELESTE（原版像素风）
    private static final String IMAGE_STYLE = STYLE_TEXTBOOK;

    private String styleDescription() {
        return STYLE_CELESTE.equals(IMAGE_STYLE) ? STYLE_CELESTE : STYLE_TEXTBOOK;
    }

    /** 文案→画面描述的约束（输出英文，禁止文字/水印） */
    private String promptInstruction() {
        return "你是图像提示词编辑。根据一页 PPT 的标题和要点，把这一页转成一条画面描述。\n"
                + "画风必须严格符合：" + styleDescription() + "。\n"
                + "内容：一张图只表达一个动作或一个处境，主体是一个正在做动作的人，背景简化，"
                + "让人一眼看懂「这是在做什么」，不要纯氛围图。\n"
                + "情绪：平和、克制，允许一点点窘迫或无奈，但不要悲伤或压抑。\n"
                + "硬性禁止：\n"
                + "1. 画面中不得出现任何文字、字母、汉字、数字、标牌、标识、水印、签名；\n"
                + "2. 不要出现书本、海报、标牌、屏幕、纸张、包装等容易被模型写上字母的平面；\n"
                + "3. 不要边框、不要分栏、不要拼图式多格；\n"
                + "4. 不要赛博朋克、厚重写实、3D 渲染、真人照片；\n"
                + "5. 不要复述 PPT 标题，只描述画面本身（动作、姿态、环境、构图）。\n"
                + "输出：只输出 JSON：{\"prompt\":\"...\"}，一句英文，120-200 个字符，可直接喂给图像模型。";
    }

    /** 模型不可用时的本地兜底画面描述（同样只讲一个动作、无文字/水印） */
    private String fallbackPrompt() {
        return styleDescription() + ", a young person attempting a simple everyday action, "
                + "slightly awkward posture, one clear subject, plain background, calm mood, "
                + "absolutely no letters, no words, no typography, no signage, no watermark, no signature, no border";
    }

    private RestTemplate restTemplate;

    @PostConstruct
    public void init() {
        var factory = new org.springframework.http.client.SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(10000);
        factory.setReadTimeout(imageReadTimeout);
        this.restTemplate = new RestTemplate(factory);
        log.info("PPT 配图供应商 = {}，endpoint = {}，model = {}，size = {}，参考图 = {}",
                IMAGE_PROVIDER, resolveBaseUrl(), resolveImageModel(), imageSize,
                StringUtils.isNotBlank(imageReferenceUrl) ? imageReferenceUrl
                        : (StringUtils.isNotBlank(imageReferencePath) ? imageReferencePath : "未配置（纯文生图）"));
    }

    /**
     * 生成一张图并落库，成功返回数据库 id（由 controller 拼成站内地址），失败返回 null。
     * 不再回退第三方原始 URL：供应商 URL 只有 1 小时，回退必然导致播放在一段时间后裂图。
     */
    public String generate(PptImageParam param) {
        String key = resolveKey();
        if (key == null) {
            log.warn("图像生成未配置 Key：Pollinations 请设置 ai.image-api-key / AI_IMAGE_API_KEY；"
                    + "硅基流动请设置 siliconflow.api-key / AI_FAST_API_KEY");
            return null;
        }

        String prompt = param.getPrompt();
        if (StringUtils.isBlank(prompt)) {
            prompt = buildPrompt(param.getTitle(), param.getPoints());
        }
        prompt = normalizePrompt(prompt);

        String url = requestImageUrl(key, prompt);
        if (StringUtils.isBlank(url)) return null;

        return downloadAndStore(url);
    }

    /** 读取站内图片，供 GET /ppt/image/{id} 使用 */
    public PptImage find(String id) {
        if (StringUtils.isBlank(id)) return null;
        return pptImageMapper.selectById(id);
    }

    private String resolveKey() {
        String k = imageApiKey == null ? "" : imageApiKey.trim();
        if (isValidKey(k)) return k;

        if (IMAGE_PROVIDER == ImageProvider.KOLORS) {
            // 复用项目已有的硅基流动 Key：dev/local 的 siliconflow.api-key，线上通常由 AI_FAST_API_KEY 注入
            String sf = siliconFlowKey == null ? "" : siliconFlowKey.trim();
            if (isValidKey(sf)) return sf;
            String fast = fastApiKey == null ? "" : fastApiKey.trim();
            if (isValidKey(fast)) return fast;
            return null;
        }

        // 智谱：仅当对话 base-url 也指向智谱时才复用对话 Key，避免把别的厂商 Key 发过去
        String chatKey = chatApiKey == null ? "" : chatApiKey.trim();
        if (isValidKey(chatKey) && chatBaseUrl != null && chatBaseUrl.contains("bigmodel.cn")) {
            return chatKey;
        }
        return null;
    }

    private boolean isValidKey(String k) {
        return k != null && !k.isEmpty() && !k.startsWith("your");
    }

    private String resolveBaseUrl() {
        String v = imageBaseUrl == null ? "" : imageBaseUrl.trim();
        if (IMAGE_PROVIDER == ImageProvider.KOLORS) {
            return v.isEmpty() || v.contains("bigmodel.cn") ? KOLORS_BASE_URL : v;
        }
        if (IMAGE_PROVIDER == ImageProvider.POLLINATIONS) {
            return v.isEmpty() || v.contains("siliconflow") || v.contains("bigmodel.cn")
                    ? POLLINATIONS_BASE_URL : v;
        }
        return v.isEmpty() || v.contains("siliconflow") ? BIGMODEL_BASE_URL : v;
    }

    private String resolveImageModel() {
        String v = imageModel == null ? "" : imageModel.trim();
        if (IMAGE_PROVIDER == ImageProvider.KOLORS) {
            return v.isEmpty() || v.toLowerCase().contains("cogview") ? KOLORS_MODEL : v;
        }
        if (IMAGE_PROVIDER == ImageProvider.POLLINATIONS) {
            return v.isEmpty() || v.toLowerCase().contains("kolors") || v.toLowerCase().contains("cogview")
                    ? POLLINATIONS_MODEL : v;
        }
        return v.isEmpty() || v.toLowerCase().contains("kolors") ? BIGMODEL_MODEL : v;
    }

    /** 标题+要点 → 一条英文画面描述；模型失败则返回 null，由 normalizePrompt 兜底 */
    private String buildPrompt(String title, List<String> points) {
        String src = "标题：" + (title == null ? "" : title)
                + "\n要点：" + (points == null ? "" : String.join(" / ", points));
        try {
            String raw = aiClient.chat(
                    Collections.singletonList(new AiMessage("user", promptInstruction() + "\n\n" + src)), true);
            if (raw == null) return null;
            JSONObject obj = parse(raw);
            String p = obj == null ? null : obj.getString("prompt");
            return StringUtils.isBlank(p) ? null : p.trim();
        } catch (Exception e) {
            log.warn("生图提示词生成失败，使用本地兜底：{}", e.getMessage());
            return null;
        }
    }

    private JSONObject parse(String raw) {
        String s = StringUtils.trimToEmpty(raw)
                .replaceAll("^```(?:json)?\\s*", "")
                .replaceAll("\\s*```$", "");
        try {
            return JSON.parseObject(s);
        } catch (Exception ignored) {
            int l = s.indexOf('{');
            int r = s.lastIndexOf('}');
            if (l >= 0 && r > l) {
                try {
                    return JSON.parseObject(s.substring(l, r + 1));
                } catch (Exception ignored2) {
                    return null;
                }
            }
            return null;
        }
    }

    /** 约束 120-200 字符；过短补风格后缀，过长截断 */
    private String normalizePrompt(String prompt) {
        String p = StringUtils.isBlank(prompt) ? fallbackPrompt() : prompt;
        p = p.replaceAll("[\\r\\n]+", " ").replaceAll("[\\t ]+", " ").trim();
        if (p.length() < 120) {
            p = p + ", one clear subject, simplified background, clean composition, "
                    + "no text, no letters, no watermark, no signature, no border";
        }
        if (p.length() > 200) {
            p = p.substring(0, 200);
        }
        return p;
    }

    private String requestImageUrl(String key, String prompt) {
        return switch (IMAGE_PROVIDER) {
            case KOLORS -> callKolors(key, prompt);
            case BIGMODEL -> callBigModel(key, prompt);
            case POLLINATIONS -> callPollinations(key, prompt);
        };
    }

    /**
     * Pollinations 新 API：请求体用 size，参考图放 image 数组（公网 URL 或 base64 data URI）。
     * 响应 data[0].url 是 media.pollinations.ai 的临时地址，所以必须立刻下载落库。
     * 带参考图失败时自动退回纯文生图，保证页面至少有图。
     */
    private String callPollinations(String key, String prompt) {
        String reference = resolveReferenceImage();
        if (reference != null) {
            String url = postPollinations(key, prompt, reference);
            if (StringUtils.isNotBlank(url)) return url;
            log.warn("Pollinations 带参考图失败，回退纯文生图");
        }
        return postPollinations(key, prompt, null);
    }

    private String postPollinations(String key, String prompt, String reference) {
        try {
            JSONObject body = new JSONObject();
            body.put("model", resolveImageModel());
            body.put("prompt", prompt);
            body.put("size", imageSize);
            body.put("n", 1);
            body.put("response_format", "url");
            if (imageSeed > 0) body.put("seed", imageSeed);
            if (reference != null) body.put("image", Collections.singletonList(reference));

            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            headers.setBearerAuth(key);

            ResponseEntity<String> resp = restTemplate.postForEntity(
                    baseUrl() + "/v1/images/generations",
                    new HttpEntity<>(body.toJSONString(), headers),
                    String.class);

            JSONObject json = JSON.parseObject(resp.getBody());
            if (json == null || json.containsKey("error")) {
                log.warn("Pollinations 返回错误：{}", resp.getBody());
                return null;
            }
            JSONArray data = json.getJSONArray("data");
            if (data == null || data.isEmpty()) {
                log.warn("Pollinations 响应无 data：{}", resp.getBody());
                return null;
            }
            return data.getJSONObject(0).getString("url");
        } catch (Exception e) {
            log.warn("Pollinations 调用失败（reference={}）：{}", reference != null, e.getMessage());
            return null;
        }
    }

    /**
     * 参考图来源：优先 ai.image-reference-url（公网 http(s)），否则读 ai.image-reference-path 本地文件转 base64。
     * 两者都没有就不传参考图，走纯文生图。
     */
    private String resolveReferenceImage() {
        String url = imageReferenceUrl == null ? "" : imageReferenceUrl.trim();
        if (url.startsWith("http://") || url.startsWith("https://")) return url;

        String path = imageReferencePath == null ? "" : imageReferencePath.trim();
        if (path.isEmpty()) return null;
        try {
            java.nio.file.Path p = java.nio.file.Path.of(path);
            if (!java.nio.file.Files.isReadable(p)) {
                log.warn("参考图不可读：{}", path);
                return null;
            }
            byte[] bytes = java.nio.file.Files.readAllBytes(p);
            String lower = path.toLowerCase();
            String mime = lower.endsWith(".png") ? "image/png"
                    : lower.endsWith(".webp") ? "image/webp" : "image/jpeg";
            return "data:" + mime + ";base64," + java.util.Base64.getEncoder().encodeToString(bytes);
        } catch (Exception e) {
            log.warn("读取参考图失败（{}）：{}", path, e.getMessage());
            return null;
        }
    }

    /** 硅基流动 Kolors：请求体用 image_size；X-Enable-Watermark: 0 关闭显式「AI生成」水印；响应 images[0].url */
    private String callKolors(String key, String prompt) {
        try {
            JSONObject body = new JSONObject();
            body.put("model", resolveImageModel());
            body.put("prompt", prompt);
            body.put("image_size", imageSize);
            body.put("batch_size", 1);
            body.put("num_inference_steps", 20);
            body.put("guidance_scale", 7.5);

            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            headers.setBearerAuth(key);
            headers.set("X-Enable-Watermark", "0");

            ResponseEntity<String> resp = restTemplate.postForEntity(
                    baseUrl() + "/images/generations",
                    new HttpEntity<>(body.toJSONString(), headers),
                    String.class);

            JSONObject json = JSON.parseObject(resp.getBody());
            if (json == null || json.containsKey("error")) {
                log.warn("Kolors 返回错误：{}", resp.getBody());
                return null;
            }
            JSONArray images = json.getJSONArray("images");
            if (images == null || images.isEmpty()) {
                log.warn("Kolors 响应无 images：{}", resp.getBody());
                return null;
            }
            return images.getJSONObject(0).getString("url");
        } catch (Exception e) {
            log.warn("Kolors 调用失败：{}", e.getMessage());
            return null;
        }
    }

    /** 智谱 CogView-3-Flash（保留的旧实现）：请求体用 size；响应 data[0].url */
    private String callBigModel(String key, String prompt) {
        try {
            JSONObject body = new JSONObject();
            body.put("model", resolveImageModel());
            body.put("prompt", prompt);
            body.put("size", imageSize);

            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            headers.setBearerAuth(key);

            ResponseEntity<String> resp = restTemplate.postForEntity(
                    baseUrl() + "/images/generations",
                    new HttpEntity<>(body.toJSONString(), headers),
                    String.class);

            JSONObject json = JSON.parseObject(resp.getBody());
            if (json == null || json.containsKey("error")) {
                log.warn("CogView 返回错误：{}", resp.getBody());
                return null;
            }
            JSONArray data = json.getJSONArray("data");
            if (data == null || data.isEmpty()) {
                log.warn("CogView 响应无 data：{}", resp.getBody());
                return null;
            }
            return data.getJSONObject(0).getString("url");
        } catch (Exception e) {
            log.warn("CogView 调用失败：{}", e.getMessage());
            return null;
        }
    }

    private String baseUrl() {
        String base = resolveBaseUrl();
        return base.endsWith("/") ? base.substring(0, base.length() - 1) : base;
    }

    /** 立即下载并落库；超过 1.5MB 先压缩成 JPEG；成功返回 id，失败 null */
    private String downloadAndStore(String url) {
        try {
            ResponseEntity<byte[]> resp = restTemplate.getForEntity(url, byte[].class);
            byte[] bytes = resp.getBody();
            if (bytes == null || bytes.length == 0) {
                log.warn("下载生成图片为空");
                return null;
            }

            String contentType = resp.getHeaders().getContentType() != null
                    ? resp.getHeaders().getContentType().toString()
                    : null;
            StoredImage stored = fitForStorage(bytes, resolveImageMime(bytes, contentType));
            if (stored == null) {
                log.warn("生成图片超过 {} 字节且压缩失败，跳过入库", MAX_STORE_BYTES);
                return null;
            }

            String id = UUID.randomUUID().toString().replace("-", "");
            PptImage image = new PptImage();
            image.setId(id);
            image.setMime(stored.mime());
            image.setData(stored.data());
            image.setCreatedAt(System.currentTimeMillis());
            if (pptImageMapper.insert(image) <= 0) {
                log.warn("PPT 配图入库失败 id={}", id);
                return null;
            }
            log.info("PPT 配图入库 id={} mime={} bytes={}", id, stored.mime(), stored.data().length);
            return id;
        } catch (Exception e) {
            log.warn("下载生成图片失败：{}", e.getMessage());
            return null;
        }
    }

    /**
     * 供应商 CDN 常把图片标成 application/octet-stream，直接入库会让 GET 变成下载而不是显示，
     * 所以优先看响应头，不是 image/* 就按文件头魔数判断真实格式。
     */
    private String resolveImageMime(byte[] b, String contentType) {
        if (contentType != null) {
            String ct = contentType.toLowerCase();
            int semi = ct.indexOf(';');
            if (semi >= 0) ct = ct.substring(0, semi).trim();
            if (ct.startsWith("image/")) return ct;
        }
        int n = b == null ? 0 : b.length;
        if (n >= 3 && (b[0] & 0xFF) == 0xFF && (b[1] & 0xFF) == 0xD8 && (b[2] & 0xFF) == 0xFF) {
            return "image/jpeg";
        }
        if (n >= 8 && (b[0] & 0xFF) == 0x89 && b[1] == 'P' && b[2] == 'N' && b[3] == 'G') {
            return "image/png";
        }
        if (n >= 12 && b[0] == 'R' && b[1] == 'I' && b[2] == 'F' && b[3] == 'F'
                && b[8] == 'W' && b[9] == 'E' && b[10] == 'B' && b[11] == 'P') {
            return "image/webp";
        }
        return "image/png";
    }

    private StoredImage fitForStorage(byte[] bytes, String mime) {
        if (bytes.length <= MAX_STORE_BYTES) {
            return new StoredImage(bytes, mime);
        }
        try {
            BufferedImage src = ImageIO.read(new ByteArrayInputStream(bytes));
            if (src == null) return null;

            BufferedImage rgb = toRgb(src);
            float scale = 1f;
            for (int i = 0; i < 10; i++) {
                BufferedImage candidate = scale == 1f ? rgb : scaled(rgb, scale);
                byte[] jpeg = writeJpeg(candidate, 0.82f);
                if (jpeg.length <= MAX_STORE_BYTES) {
                    return new StoredImage(jpeg, "image/jpeg");
                }
                scale *= 0.85f;
            }
        } catch (Exception e) {
            log.warn("生成图片压缩失败：{}", e.getMessage());
        }
        return null;
    }

    private BufferedImage toRgb(BufferedImage src) {
        int w = src.getWidth();
        int h = src.getHeight();
        BufferedImage rgb = new BufferedImage(w, h, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = rgb.createGraphics();
        try {
            g.setColor(Color.WHITE);
            g.fillRect(0, 0, w, h);
            g.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BICUBIC);
            g.drawImage(src, 0, 0, null);
        } finally {
            g.dispose();
        }
        return rgb;
    }

    private BufferedImage scaled(BufferedImage src, float factor) {
        int w = Math.max(1, (int) (src.getWidth() * factor));
        int h = Math.max(1, (int) (src.getHeight() * factor));
        BufferedImage out = new BufferedImage(w, h, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = out.createGraphics();
        try {
            g.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BICUBIC);
            g.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY);
            g.drawImage(src, 0, 0, w, h, null);
        } finally {
            g.dispose();
        }
        return out;
    }

    private byte[] writeJpeg(BufferedImage image, float quality) throws Exception {
        ImageWriter writer = ImageIO.getImageWritersByFormatName("jpeg").next();
        ImageWriteParam param = writer.getDefaultWriteParam();
        param.setCompressionMode(ImageWriteParam.MODE_EXPLICIT);
        param.setCompressionQuality(quality);
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        try (ImageOutputStream ios = ImageIO.createImageOutputStream(out)) {
            writer.setOutput(ios);
            writer.write(null, new IIOImage(image, null, null), param);
        } finally {
            writer.dispose();
        }
        return out.toByteArray();
    }

    private record StoredImage(byte[] data, String mime) {
    }
}
