"""Turn the Google Maps export spreadsheet into data/spots.js for the app.

Usage: python3 scripts/build_data.py path/to/maps.xlsx data/spots.js
Keeps only food spots (Restaurant / Bar, Cafe / Bakery / Dessert) and
guesses a few cuisine "tags" from each name with simple keyword rules.
"""
import json, re, sys
import openpyxl

FOOD = {"Restaurant / Bar": "r", "Cafe / Bakery / Dessert": "c"}

# This is a foodie app, so anything saved for the kids / busy-mom side of the
# spreadsheet is left out, even when Google calls it a restaurant.
KID_LIST = re.compile(r"kid|baby|playground|learn|school|toddler", re.I)
KID_NAME = re.compile(r"\bkids?\b|kidtropolis|toddler|playground|playland|fun center|coloring", re.I)

# Places Google filed under food that are really stores, farms or attractions.
NOT_FOOD = [
    "studio anthurium", "wndr museum", "george's zoo", "sugarplum zoo", "instant replay",
    "five below", "daiso", "second harvest", "oomomo", "abc stores", "line friends", "eslite",
    "city farmers nursery", "carrefour", "t&t supermarket", "foodland farms", "mitsuwa marketplace",
    "jasons market", "lazy acres", "blue house farm", "harley farms", "rodin farms", "berry island farm",
    "ljb farms", "tru2earth farm", "holl & stone farms", "li chuan aquafarm", "paradise island farm",
    "farmer's daughter produce", "bates nut farm", "general store", "kaohu store", "waikane store",
    "dairy education center",
]

# tag -> keywords (matched against the lowercased name)
TAGS = {
    "coffee":    ["coffee", "café", "cafe", "caffe", "caffè", "espresso", "roaster", "kissa", "latte", "brew bar"],
    "bakery":    ["bakery", "bakeshop", "bake shop", "boulangerie", "patisserie", "pâtisserie", "croissant",
                  "bread", "bagel", "baking", "pie ", "pies", "boulang", "panader", "bakehouse"],
    "sweets":    ["ice cream", "gelato", "gelateria", "creamery", "dessert", "sweet", "cake", "cakery", "cookie",
                  "donut", "doughnut", "shave ice", "mochi", "crepe", "crêpe", "chocolat", "churro", "yogurt",
                  "froyo", "malasada", "paleteria", "sorbet", "scoop", "candy", "fudge", "custard", "pudding", "waffle", "mixue"],
    "boba & tea":["boba", "milk tea", "bubble tea", "tapioca", "matcha", "tea house", "teahouse", " tea", "茶",
                  "tpumps", "sharetea", "gong cha", "kung fu tea", "chicha"],
    "noodles":   ["ramen", "noodle", "pho", "phở", "udon", "soba", "tsukemen", "面", "麺", "mian", "pasta", "knife cut"],
    "japanese":  ["sushi", "izakaya", "japanese", "omakase", "katsu", "yakitori", "teriyaki", "donburi",
                  "onigiri", "musubi", "ramen", "udon", "tempura", "kissa", "yakiniku", "sake", "japan"],
    "korean":    ["korean", "tofu house", "bibimbap", "kbbq", "seoul", "gukbap", "pocha", "bonchon", "kimchi",
                  "bulgogi", "korea"],
    "chinese":   ["dumpling", "dim sum", "xiao long", "bao", "chinese", "szechuan", "sichuan", "hunan",
                  "canton", "hong kong", "hot pot", "hotpot", "wok", "shanghai", "taiwan", "yunnan", "peking",
                  "xi'an", "xian", "chongqing", "mandarin", "congee"],
    "thai":      ["thai", "siam", "bangkok"],
    "vietnamese":["pho", "phở", "banh mi", "bánh mì", "vietnam", "saigon", "hanoi"],
    "indian":    ["indian", "curry", "tandoor", "masala", "biryani", "dosa", "chaat", "punjab", "himalaya",
                  "nepal", "india", "naan"],
    "mexican":   ["taco", "taqueria", "mexican", "burrito", "cantina", "cocina", "tortilla", "carnitas",
                  "mariscos", "birria", "takos", "tamale", "pupus", "pupuseria", "mexico", "salsa"],
    "pizza & italian": ["pizza", "pizzeria", "italian", "trattoria", "osteria", "ristorante", "cucina",
                  "pasta", "enoteca", "gelato"],
    "burgers & sandwiches": ["burger", "sandwich", "deli", "hot dog", "hoagie", "subs", "banh mi", "grilled cheese",
                  "in-n-out", "shake shack"],
    "seafood":   ["seafood", "fish", "oyster", "lobster", "crab", "shrimp", "poke", "clam", "chowder", "mariscos"],
    "hawaiian":  ["hawaiian", "poke", "plate lunch", "shave ice", "musubi", "loco moco", "malasada", "aloha",
                  "ono ", "hawaii"],
    "mediterranean": ["mediterranean", "greek", "falafel", "shawarma", "kebab", "kabob", "middle east",
                  "lebanese", "turkish", "persian", "gyro", "halal", "mezze", "afghan"],
    "bbq":       ["bbq", "barbecue", "smokehouse", "brisket", "kolgrill"],
    "brunch":    ["brunch", "breakfast", "pancake", "waffle", "diner", "egg", "biscuit", "griddle"],
    "drinks":    ["bar ", " bar", "brewing", "brewery", "taproom", "taphouse", "wine", "winery", "vineyard",
                  "pub", "tavern", "cocktail", "saloon", "beer", "cellars", "distill", "lounge"],
    "veggie":    ["vegetarian", "vegan", "plant", "veggie", "salad", "greens"],
}

def tags_for(name, cat, lists):
    low = " " + name.lower() + " "
    tags = [t for t, kws in TAGS.items() if any(k in low for k in kws)]
    if any("vegetarian" in l.lower() for l in lists) and "veggie" not in tags:
        tags.append("veggie")
    if "indian" in tags and ({"japanese", "thai"} & set(tags)):
        tags.remove("indian")  # japanese / thai curry
    if cat == "c" and not tags:
        tags.append("coffee")
    return tags

def main(src, out):
    ws = openpyxl.load_workbook(src, read_only=True).active
    spots = []
    skipped = 0
    for row in ws.iter_rows(min_row=2, values_only=True):
        name, cat, city, miles, lists, addr, link, _note = row[:8]
        if cat not in FOOD or not name:
            continue
        lists = [l.strip() for l in lists.split(";")] if isinstance(lists, str) else []
        low_name = str(name).lower()
        if any(KID_LIST.search(l) for l in lists) or KID_NAME.search(low_name) or any(x in low_name for x in NOT_FOOD):
            skipped += 1
            continue
        lists = [l for l in lists if l and not l.startswith("(")]
        status = "fav" if "Favorite places" in lists else ("want" if "Want to go" in lists else "saved")
        c = FOOD[cat]
        spots.append({
            "id": len(spots),
            "n": " ".join(str(name).split()),
            "c": c,
            "city": city or "",
            "mi": round(float(miles), 1) if isinstance(miles, (int, float)) else None,
            "l": [l for l in lists if l not in ("Favorite places", "Want to go", "Default list", "Default list(1)")],
            "s": status,
            "a": addr or "",
            "m": link or "",
            "t": tags_for(str(name), c, lists),
        })
    with open(out, "w", encoding="utf-8") as f:
        f.write("// generated by scripts/build_data.py, do not edit by hand\n")
        f.write("window.SPOTS = ")
        json.dump(spots, f, ensure_ascii=False, separators=(",", ":"))
        f.write(";\n")
    tagged = sum(1 for s in spots if s["t"])
    print(f"{len(spots)} food spots ({skipped} kid/non-food places left out), {tagged} tagged ({tagged*100//len(spots)}%) -> {out}")

if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
