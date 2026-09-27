"""Seeds the LOCAL Supabase stack with neutral discovery candidates for manual testing.

Usage:  python scripts/seed-local-discovery.py            (adds or replaces the seed profiles)
        python scripts/seed-local-discovery.py --remove   (removes them)

- Local development stack only: keys come from `supabase status`; any non-local URL is refused.
- Neutral identities only ("Profile 01" ...), test emails test.profile.NN@srmist.edu.in.
- Placeholder portraits are drawn here (no real photos, no people).
Needs Python 3 with Pillow.
"""

import io
import json
import subprocess
import sys
import urllib.error
import urllib.request
import uuid
from datetime import date, timedelta

from PIL import Image, ImageDraw

EMAIL = "test.profile.{:02d}@srmist.edu.in"

# (n, gender, show_me, age, privacy, zodiac_visible, photos, min_age, max_age, fresh, hook)
PROFILES = [
    (1, "woman", ["man", "woman", "non_binary"], 21, "normal", True, 2, 18, 30, False, "Sunrise runs, late chai"),
    (2, "non_binary", ["man", "woman", "non_binary"], 23, "normal", False, 1, 18, 30, False, "Always carrying a sketchbook"),
    (3, "woman", ["non_binary"], 24, "anonymous", True, 2, 18, 30, False, "Ask me about my playlist"),
    (4, "woman", ["man", "woman", "non_binary"], 20, "private", False, 1, 18, 30, False, "Quiet cafes and loud concerts"),
    (5, "woman", ["man", "woman", "non_binary"], 22, "normal", False, 2, 18, 30, False, "Filter coffee evangelist"),
    (6, "man", ["woman"], 23, "normal", False, 1, 18, 30, False, "Cricket at 6 am"),
    (7, "non_binary", ["man", "woman", "non_binary"], 25, "normal", True, 1, 18, 30, False, "Board games, zero chill"),
    (8, "woman", ["man", "woman", "non_binary"], 26, "normal", False, 1, 25, 30, False, "Here for good conversation"),
    (9, "woman", ["man", "woman", "non_binary"], 22, "normal", True, 1, 18, 30, True, "New here, say hi"),
    (10, "non_binary", ["man", "woman", "non_binary"], 21, "normal", False, 3, 18, 30, False, "Film photography nerd"),
    (11, "woman", ["woman", "non_binary"], 29, "normal", False, 1, 18, 35, False, "Books over everything"),
    (12, "woman", ["man", "woman", "non_binary"], 23, "normal", True, 2, 18, 30, False, "Beach walks, bad puns"),
]


def status():
    out = subprocess.run("npx supabase status -o json", shell=True, capture_output=True, text=True, check=True)
    data = json.loads(out.stdout)
    url = data["API_URL"]
    if not (url.startswith("http://127.0.0.1:") or url.startswith("http://localhost:")):
        sys.exit(f"Refusing to run against a non-local Supabase: {url}")
    return url, data["SERVICE_ROLE_KEY"]


URL, KEY = status()
HEADERS = {"apikey": KEY, "Authorization": f"Bearer {KEY}"}


def call(method, path, body=None, content_type="application/json", extra=None):
    data = None
    headers = dict(HEADERS)
    if extra:
        headers.update(extra)
    if body is not None:
        data = body if isinstance(body, bytes) else json.dumps(body).encode()
        headers["Content-Type"] = content_type
    request = urllib.request.Request(URL + path, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(request) as response:
            raw = response.read()
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as error:
        sys.exit(f"{method} {path} failed: {error.code} {error.read().decode()[:300]}")


def portrait(n, index, width, height):
    """A placeholder portrait: soft two-tone background, a head and shoulders silhouette."""
    hue = (n * 47 + index * 19) % 360
    image = Image.new("HSV", (width, height))
    draw = ImageDraw.Draw(image)
    for y in range(height):
        draw.line([(0, y), (width, y)], fill=(int(hue * 255 / 360), 90, int(200 - 90 * y / height)))
    image = image.convert("RGB")
    draw = ImageDraw.Draw(image)
    tone = (235, 228, 220)
    draw.ellipse([width * 0.33, height * 0.2, width * 0.67, height * 0.47], fill=tone)
    draw.rounded_rectangle([width * 0.18, height * 0.52, width * 0.82, height * 1.05], radius=int(width * 0.2), fill=tone)
    return image


def jpeg(image, quality=85):
    buffer = io.BytesIO()
    image.save(buffer, "JPEG", quality=quality)
    return buffer.getvalue()


def existing_seed_users():
    users = []
    page = 1
    while True:
        batch = call("GET", f"/auth/v1/admin/users?page={page}&per_page=200")["users"]
        users += [u for u in batch if u["email"].startswith("test.profile.")]
        if len(batch) < 200:
            return users
        page += 1


def remove():
    for user in existing_seed_users():
        objects = call("POST", "/storage/v1/object/list/profile-photos", {"prefix": user["id"], "limit": 100}) or []
        if objects:
            call("DELETE", "/storage/v1/object/profile-photos", {"prefixes": [f"{user['id']}/{o['name']}" for o in objects]})
        blurred = call("POST", "/storage/v1/object/list/profile-photos-blurred", {"prefix": user["id"], "limit": 100}) or []
        if blurred:
            call("DELETE", "/storage/v1/object/profile-photos-blurred", {"prefixes": [f"{user['id']}/{o['name']}" for o in blurred]})
        call("DELETE", f"/auth/v1/admin/users/{user['id']}")
    print("removed seed profiles")


def seed():
    remove()
    terms = call("GET", "/rest/v1/app_config?key=eq.current_terms_version&select=value")[0]["value"]["version"]
    today = date.today()
    for n, gender, show_me, age, privacy, zodiac_visible, photos, min_age, max_age, fresh, hook in PROFILES:
        # No password: SOUL accounts sign in only with an emailed code (D-046).
        user = call("POST", "/auth/v1/admin/users", {
            "email": EMAIL.format(n),
            "email_confirm": True,
        })
        uid = user["id"]
        dob = today.replace(year=today.year - age) - timedelta(days=40 + n)
        # Profiles completed in the last week are shown first (D-042).
        completed = today if fresh else today - timedelta(days=30)
        call("PATCH", f"/rest/v1/account_private?id=eq.{uid}", {
            "terms_version": terms,
            "terms_accepted_at": today.isoformat(),
            "date_of_birth": dob.isoformat(),
            "profile_completed_at": completed.isoformat(),
        })
        call("PATCH", f"/rest/v1/profiles?id=eq.{uid}", {
            "display_name": f"Profile {n:02d}",
            "hook": hook,
            "about": "This is a seeded test profile for local development. It says a little about "
                     "who they are and what they enjoy on and off campus.",
            "gender": gender,
            "privacy_mode": privacy,
            "zodiac_visible": zodiac_visible,
        })
        call("PATCH", f"/rest/v1/preferences?user_id=eq.{uid}", {
            "show_me": show_me, "min_age": min_age, "max_age": max_age,
        })
        for index in range(photos):
            photo_id = str(uuid.uuid4())
            path = f"{uid}/{photo_id}.jpg"
            image = portrait(n, index, 1080, 1350)
            call("POST", f"/storage/v1/object/profile-photos/{path}", jpeg(image), "image/jpeg")
            call("POST", f"/storage/v1/object/profile-photos-blurred/{path}", jpeg(image.resize((24, 30)), 70), "image/jpeg")
            call("POST", "/rest/v1/profile_photos", {
                "id": photo_id, "user_id": uid, "storage_path": path, "blurred_path": path,
                "position": index, "status": "approved", "source": "camera" if index == 0 else "library",
                "width": 1080, "height": 1350, "reviewed_at": today.isoformat(),
            }, extra={"Prefer": "return=minimal"})
        print(f"seeded Profile {n:02d} ({gender}, {age}, {privacy})")


if __name__ == "__main__":
    remove() if "--remove" in sys.argv else seed()
