import os
import base64
import json
import re
import io
import traceback
from flask import Flask, request, jsonify, render_template, send_from_directory
from groq import Groq
import cv2
import numpy as np
from PIL import Image
import tempfile

app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max upload

# ─── Image Analysis ────────────────────────────────────────────────────────────

def analyze_image_opencv(image_bytes):
    """Use OpenCV for face detection and image analysis."""
    nparr = np.frombuffer(image_bytes, np.uint8)
    img_cv = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

    if img_cv is None:
        return {"error": "Could not decode image"}

    results = {}
    h, w = img_cv.shape[:2]
    results["dimensions"] = {"width": int(w), "height": int(h)}
    results["aspect_ratio"] = round(w / h, 2)

    # Face detection
    face_cascade_path = cv2.data.haarcascades + 'haarcascade_frontalface_default.xml'
    eye_cascade_path  = cv2.data.haarcascades + 'haarcascade_eye.xml'

    face_cascade = cv2.CascadeClassifier(face_cascade_path)
    eye_cascade  = cv2.CascadeClassifier(eye_cascade_path)

    gray = cv2.cvtColor(img_cv, cv2.COLOR_BGR2GRAY)
    faces = face_cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5, minSize=(30, 30))

    results["faces_detected"] = len(faces)

    if len(faces) > 0:
        # Largest face
        face = max(faces, key=lambda f: f[2] * f[3])
        fx, fy, fw, fh = face
        results["primary_face"] = {
            "x": int(fx), "y": int(fy),
            "width": int(fw), "height": int(fh),
            "face_ratio": round((fw * fh) / (w * h), 3)
        }

        # Face region for skin tone
        face_region = img_cv[fy:fy+fh, fx:fx+fw]
        face_rgb    = cv2.cvtColor(face_region, cv2.COLOR_BGR2RGB)

        # Sample central area (avoid hair/background)
        cy, cx = fh // 2, fw // 2
        margin = min(fh, fw) // 4
        center = face_rgb[cy-margin:cy+margin, cx-margin:cx+margin]

        if center.size > 0:
            avg_color = center.reshape(-1, 3).mean(axis=0)
            results["face_avg_color_rgb"] = [int(avg_color[0]), int(avg_color[1]), int(avg_color[2])]

        # Eyes
        face_gray = gray[fy:fy+fh, fx:fx+fw]
        eyes      = eye_cascade.detectMultiScale(face_gray, scaleFactor=1.1, minNeighbors=10)
        results["eyes_detected"] = len(eyes)

    # Overall image color palette via PIL
    pil_img  = Image.fromarray(cv2.cvtColor(img_cv, cv2.COLOR_BGR2RGB))
    palette  = extract_color_palette(pil_img)
    results["dominant_colors"] = palette

    # Brightness / contrast
    gray_full = cv2.cvtColor(img_cv, cv2.COLOR_BGR2GRAY)
    results["brightness"]  = round(float(gray_full.mean()), 1)
    results["contrast"]    = round(float(gray_full.std()),  1)

    return results


def extract_color_palette(pil_img, n_colors=6):
    """Extract dominant colors using PIL and NumPy k-means clustering."""
    img_resized = pil_img.resize((150, 150))
    img_array   = np.array(img_resized).reshape(-1, 3).astype(np.float32)

    # Simple k-means
    criteria = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 100, 0.2)
    _, labels, centers = cv2.kmeans(
        img_array, n_colors, None, criteria, 10, cv2.KMEANS_RANDOM_CENTERS
    )

    centers  = centers.astype(int)
    counts   = np.bincount(labels.flatten())
    sorted_i = np.argsort(-counts)

    palette = []
    for i in sorted_i:
        r, g, b = centers[i]
        palette.append({
            "rgb": [int(r), int(g), int(b)],
            "hex": f"#{r:02x}{g:02x}{b:02x}",
            "percentage": round(float(counts[i]) / len(labels) * 100, 1)
        })
    return palette


def classify_skin_tone(rgb):
    """Classify skin tone from RGB values using lightness."""
    if not rgb:
        return "unknown"
    r, g, b = rgb
    # Convert to perceived lightness
    lightness = (0.299 * r + 0.587 * g + 0.114 * b) / 255.0
    if lightness > 0.78:
        return "fair"
    elif lightness > 0.64:
        return "light"
    elif lightness > 0.50:
        return "medium"
    elif lightness > 0.36:
        return "tan"
    elif lightness > 0.22:
        return "deep"
    else:
        return "ebony"


def image_to_base64(image_bytes, mime_type="image/jpeg"):
    return base64.b64encode(image_bytes).decode("utf-8")


# ─── Groq AI ───────────────────────────────────────────────────────────────────

def get_styling_recommendations(api_key, profile, cv_analysis, image_b64=None, mime_type="image/jpeg"):
    """Call Groq LLaMA 3.3 70B for styling recommendations."""
    client = Groq(api_key=api_key)

    skin_tone_auto = "unknown"
    if cv_analysis.get("face_avg_color_rgb"):
        skin_tone_auto = classify_skin_tone(cv_analysis["face_avg_color_rgb"])

    skin_tone = profile.get("skin_tone") or skin_tone_auto

    cv_summary = f"""
OpenCV Analysis Results:
- Image: {cv_analysis.get('dimensions', {}).get('width')}x{cv_analysis.get('dimensions', {}).get('height')}px
- Faces detected: {cv_analysis.get('faces_detected', 0)}
- Auto-detected skin tone class: {skin_tone_auto}
- Face avg color RGB: {cv_analysis.get('face_avg_color_rgb', 'N/A')}
- Image brightness: {cv_analysis.get('brightness', 'N/A')} / 255
- Image contrast (std): {cv_analysis.get('contrast', 'N/A')}
- Dominant image colors: {json.dumps(cv_analysis.get('dominant_colors', [])[:3])}
""".strip()

    user_profile = f"""
User Profile:
- Gender: {profile.get('gender', 'Not specified')}
- Age: {profile.get('age', 'Not specified')}
- Skin Tone (user-selected): {skin_tone}
- Style Personas: {', '.join(profile.get('personas', [])) or 'Open'}
- Occasions: {', '.join(profile.get('occasions', [])) or 'General'}
- Budget: {profile.get('budget', 'mid-range')}
- Body type: {profile.get('body_type', 'Not specified')}
- Additional notes: {profile.get('notes', 'None')}
""".strip()

    system_prompt = """You are StyleAI, an elite personal stylist powered by advanced computer vision and AI. 
You have been given detailed OpenCV image analysis results including face detection data, skin tone measurements, and color palette extraction.
Use this technical data to provide highly personalised, editorial-quality fashion recommendations.
Always respond with ONLY valid JSON — no markdown, no prose outside the JSON."""

    # Build messages — include image if available
    messages = [{"role": "system", "content": system_prompt}]

    user_content = []
    if image_b64:
        user_content.append({
            "type": "image_url",
            "image_url": {"url": f"data:{mime_type};base64,{image_b64}"}
        })

    user_content.append({
        "type": "text",
        "text": f"""Based on the following data, generate comprehensive fashion styling recommendations.

{user_profile}

{cv_summary}

Respond ONLY with this JSON (no extra text, no markdown fences):
{{
  "style_identity": {{
    "headline": "4-6 word poetic style identity",
    "archetype": "one word archetype",
    "description": "2-sentence persona description",
    "signature_elements": ["element1", "element2", "element3", "element4"]
  }},
  "skin_analysis": {{
    "detected_tone": "{skin_tone}",
    "undertone": "warm|cool|neutral|olive",
    "confidence": "high|medium|low",
    "complexion_notes": "Brief note about their complexion"
  }},
  "color_palette": {{
    "hero_colors": [
      {{"name": "ColorName", "hex": "#XXXXXX", "why": "reason"}},
      {{"name": "ColorName", "hex": "#XXXXXX", "why": "reason"}},
      {{"name": "ColorName", "hex": "#XXXXXX", "why": "reason"}},
      {{"name": "ColorName", "hex": "#XXXXXX", "why": "reason"}},
      {{"name": "ColorName", "hex": "#XXXXXX", "why": "reason"}}
    ],
    "neutrals": [
      {{"name": "ColorName", "hex": "#XXXXXX"}},
      {{"name": "ColorName", "hex": "#XXXXXX"}},
      {{"name": "ColorName", "hex": "#XXXXXX"}}
    ],
    "avoid": [
      {{"name": "ColorName", "hex": "#XXXXXX", "why": "reason"}},
      {{"name": "ColorName", "hex": "#XXXXXX", "why": "reason"}}
    ],
    "best_metals": ["Gold|Silver|Rose Gold|Bronze|Platinum"],
    "palette_story": "One sentence describing the palette direction"
  }},
  "outfits": [
    {{
      "name": "Outfit Name",
      "occasion": "occasion",
      "mood": "mood word",
      "pieces": [
        {{"item": "Specific garment", "color": "suggested color", "notes": "fit/style tip"}},
        {{"item": "Specific garment", "color": "suggested color", "notes": "fit/style tip"}},
        {{"item": "Specific shoes", "color": "suggested color", "notes": "fit/style tip"}},
        {{"item": "Key accessory", "color": "suggested color", "notes": "styling tip"}}
      ],
      "pro_tip": "One specific pro styling tip",
      "avoid_for_this_look": "What not to do",
      "shop_references": [
        {{"brand": "Brand", "search": "search term", "url": "https://www.zara.com/"}},
        {{"brand": "Brand", "search": "search term", "url": "https://www2.hm.com/"}}
      ]
    }}
  ],
  "wardrobe_blueprint": {{
    "capsule_essentials": ["piece1", "piece2", "piece3", "piece4", "piece5", "piece6"],
    "investment_pieces": [
      {{"item": "piece", "reason": "why invest"}},
      {{"item": "piece", "reason": "why invest"}}
    ],
    "style_mistakes_to_avoid": ["mistake1", "mistake2", "mistake3"]
  }},
  "grooming_finishing": {{
    "hair_direction": "Specific hair recommendation",
    "fragrance_profile": "Fragrance family and notes direction",
    "key_accessories": ["accessory1", "accessory2", "accessory3"],
    "eyewear_if_applicable": "Frame shape recommendation"
  }},
  "cv_insights": {{
    "face_shape_estimate": "oval|round|square|heart|oblong|diamond",
    "neckline_recommendations": ["neckline1", "neckline2"],
    "pattern_recommendations": ["pattern1", "pattern2"],
    "silhouette_advice": "Overall silhouette recommendation"
  }}
}}

Generate exactly 3 outfits for: {', '.join(profile.get('occasions', ['Everyday', 'Work', 'Evening'])[:3])}.
Make all recommendations gender-appropriate for: {profile.get('gender', 'any gender')}.
Budget level: {profile.get('budget', 'mid-range')} — adjust brands accordingly."""
    })

    messages.append({"role": "user", "content": user_content})

    response = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=messages,
        max_tokens=2500,
        temperature=0.8,
    )

    raw = response.choices[0].message.content
    # Strip markdown fences if present
    raw = re.sub(r"```(?:json)?", "", raw).strip().rstrip("`").strip()

    return json.loads(raw)


# ─── Routes ────────────────────────────────────────────────────────────────────

@app.route("/")
def index():
    return render_template("index.html")


@app.route("/analyze", methods=["POST"])
def analyze():
    try:
        api_key = request.form.get("api_key", "").strip()
        if not api_key:
            return jsonify({"error": "Groq API key is required"}), 400

        # Parse profile JSON
        profile_raw = request.form.get("profile", "{}")
        try:
            profile = json.loads(profile_raw)
        except Exception:
            profile = {}

        image_bytes = None
        image_b64   = None
        mime_type   = "image/jpeg"
        cv_analysis = {}

        # Handle image upload
        if "photo" in request.files:
            photo = request.files["photo"]
            if photo and photo.filename:
                image_bytes = photo.read()
                mime_type   = photo.content_type or "image/jpeg"

                # OpenCV + PIL analysis
                cv_analysis = analyze_image_opencv(image_bytes)
                image_b64   = image_to_base64(image_bytes, mime_type)

        # Get AI recommendations
        recommendations = get_styling_recommendations(
            api_key, profile, cv_analysis, image_b64, mime_type
        )

        return jsonify({
            "success": True,
            "cv_analysis": cv_analysis,
            "recommendations": recommendations
        })

    except json.JSONDecodeError as e:
        return jsonify({"error": f"Failed to parse AI response as JSON: {str(e)}"}), 500
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@app.route("/health")
def health():
    return jsonify({"status": "ok", "model": "llama-3.3-70b-versatile"})


if __name__ == "__main__":
    app.run(debug=True, port=5000)
