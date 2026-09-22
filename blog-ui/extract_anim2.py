import zipfile, re
z = zipfile.ZipFile(r'c:\Users\28464\IdeaProjects\blog\blog-ui\Atlases\WaveDashing\凌波微步.ppt.pptx')

for sname in ['ppt/slides/slide1.xml', 'ppt/slides/slide3.xml']:
    print('\n########', sname)
    data = z.read(sname).decode('utf-8')
    m = re.search(r'<p:timing>.*?</p:timing>', data, re.S)
    timing = m.group(0)
    # 找每个 cTn 的 presetID 和时长
    # 按 par/cTn 切分
    # 找所有含 presetID 的 cTn
    ctns = re.findall(r'<p:cTn[^>]*presetID="(\d+)"[^>]*dur="([^"]+)"[^>]*>', timing)
    print('cTn preset/dur:', ctns)
    # 打印完整 timing（缩进简化）
    # 替换长空白
    pretty = re.sub(r'>\s+<', '><', timing)
    print(pretty[:4000])
