#!/usr/bin/env python3
"""Build the inline Space Grotesk 600 subset used only by the CredentAgent wordmark.

Usage:  <venv>/bin/python tools/build-wordmark-font.py SpaceGrotesk[wght].ttf > wordmark.b64
Needs:  pip install fonttools brotli
Source: https://github.com/google/fonts/tree/main/ofl/spacegrotesk (SIL Open Font License 1.1).
Output: base64 woff2 containing only the glyphs of "CredentAgent", instanced at weight 600.
"""
import base64
import io
import sys

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

font = instantiateVariableFont(TTFont(sys.argv[1]), {"wght": 600})
options = subset.Options()
options.flavor = "woff2"
options.layout_features = ["kern", "liga"]
options.name_IDs = ["*"]  # keep the copyright / licence name records
subsetter = subset.Subsetter(options=options)
subsetter.populate(text="CredentAgent")
subsetter.subset(font)
buf = io.BytesIO()
font.flavor = "woff2"
font.save(buf)
sys.stdout.write(base64.b64encode(buf.getvalue()).decode("ascii"))
