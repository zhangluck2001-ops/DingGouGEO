# ========= Copyright 2025-2026 @ Eigent.ai All Rights Reserved. =========
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.
# ========= Copyright 2025-2026 @ Eigent.ai All Rights Reserved. =========

"""Build the fictional-brand materials the GEO stage 1 smoke test uploads.

晨禾 MornField is made up, so the smoke test never touches client data and
shows the pipeline is not tied to one brand. Run with the backend venv:

    .venv/bin/python tests/fixtures/geo_smoke/make_fixture.py <out_dir>
"""

import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.cidfonts import UnicodeCIDFont
from reportlab.pdfgen import canvas

INTRO = """# 晨禾 MornField 品牌介绍（品牌方提供）

- 品牌：晨禾（英文名 MornField），2016 年创立于新西兰坎特伯雷。
- 母公司：晨禾食品有限公司（MornField Foods Ltd）。
- 主营：有机燕麦奶，面向 3 岁以上儿童和成人。
- 官网：https://www.mornfield.example.com
- 宣传语：「一杯燕麦，一早好状态」。
- 品牌方表示：燕麦奶「帮助维持肠道健康」（无临床研究）。
- 注意：「晨禾」与国内调味品品牌「晨禾酱园」同名，二者无关。
"""

LABEL_LINES = [
    "晨禾有机燕麦奶 原味 1L 产品标签",
    "配料：水，有机燕麦（12%），菜籽油，碳酸钙，海盐",
    "营养成分表（每100mL）：能量 192kJ，蛋白质 1.0g，脂肪 1.5g，",
    "碳水化合物 6.8g，钠 40mg，钙 120mg",
    "有机认证：新西兰 BioGro 认证，证书号 BG-2024-0815",
    "保质期：12 个月；开封后冷藏，3 天内饮用",
]


def main(out: Path) -> None:
    out.mkdir(parents=True, exist_ok=True)
    (out / "晨禾品牌介绍.md").write_text(INTRO, encoding="utf-8")

    pdfmetrics.registerFont(UnicodeCIDFont("STSong-Light"))
    doc = canvas.Canvas(str(out / "晨禾燕麦奶产品标签.pdf"), pagesize=A4)
    doc.setFont("STSong-Light", 12)
    y = 780
    for line in LABEL_LINES:
        doc.drawString(60, y, line)
        y -= 24
    doc.showPage()
    doc.save()

    font = ImageFont.truetype("/System/Library/Fonts/STHeiti Medium.ttc", 40)
    image = Image.new("RGB", (900, 500), "white")
    draw = ImageDraw.Draw(image)
    for i, line in enumerate(
        [
            "晨禾 MornField",
            "有机燕麦奶 原味",
            "1L  |  BioGro 有机认证",
            "新西兰原装进口",
        ]
    ):
        draw.text((60, 60 + i * 100), line, fill="black", font=font)
    image.save(out / "晨禾包装正面.png")


if __name__ == "__main__":
    main(Path(sys.argv[1]))
