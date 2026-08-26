"""Verified photo URLs for the seeded catalog — one pool, read by every seed command.

## Where these came from, and the rule for adding one

Every URL was extracted from a live Unsplash search-result page on 2026-08-26, chosen by its
published alt text, normalised to one rendition (`w=800`), and HEAD-checked before landing here.
**Never invent a photo id**: a guessed URL 404s or shows the wrong subject, and a wrong picture
on a service tile is worse than the icon fallback the client already has. Add a new subject by
searching unsplash.com, copying a real `images.unsplash.com/photo-…` URL, and verifying it.

`plus.unsplash.com` (Unsplash+ premium) URLs are deliberately absent — they watermark for
non-subscribers.

Keyed by **subject**, not by slug: two tiles may share a photo, and a seed names the subject it
means rather than relying on its own slug happening to exist here. `image_for()` fails loudly on
an unknown subject for exactly that reason.
"""

from typing import Final

_BASE = "https://images.unsplash.com"
_RENDITION = "?auto=format&fit=crop&w=800&q=70"


def _u(photo_path: str) -> str:
    return f"{_BASE}/{photo_path}{_RENDITION}"


#: subject -> ordered pool. The first entry is the subject's tile/hero image; the rest are
#: rotated across service covers inside that tile so neighbouring cards do not repeat.
SEED_IMAGE_POOLS: Final[dict[str, tuple[str, ...]]] = {
    # -- category heroes -----------------------------------------------------
    "technician": (
        _u("photo-1562259929-b4e1fd3aef09"),  # Makita power drill
        _u("photo-1676311396794-f14881e9daaa"),  # tools on a table
        _u("photo-1645651964715-d200ce0939cc"),  # tools on a table
    ),
    "electrician": (
        _u("photo-1621905251189-08b45d6a269e"),  # electrician installing wiring, hardhat
        _u("photo-1555963966-b7ae5404b6ed"),  # man fixing steel cable
        _u("photo-1682345262055-8f95f3c513ea"),  # person holding wires
        _u("photo-1660330589693-99889d60181e"),  # screwdriver on electrical panel
    ),
    "plumber": (
        _u("photo-1749532125405-70950966b0e5"),  # plumber repairs bathroom plumbing
        _u("photo-1676210134050-6f12c6898395"),  # red gloves working on a toilet
    ),
    "air-conditioner": (
        _u("photo-1718203862467-c33159fdc504"),  # AC on brick wall
        _u("photo-1700124113583-81aa99ea2aa2"),  # AC on side of building
        _u("photo-1436473849883-bb3464c23e93"),  # rectangular white unit
    ),
    "beautician": (
        _u("photo-1709477542149-f4e0e21d590b"),  # woman getting make-up done
        _u("photo-1636023730877-233b9237d4ec"),  # makeup artist at work
    ),
    "home-cleaning": (
        _u("photo-1563453392212-326f5e854473"),  # yellow spray bottle
        _u("photo-1740657254989-42fe9c3b8cce"),  # gloves cleaning a floor
        _u("photo-1585421514284-efb74c2b69ba"),  # wiping a white surface
        _u("photo-1647381518264-97ff1835026f"),  # broom in a kitchen
    ),
    "pet-care": (
        _u("photo-1561037404-61cd46aa615b"),  # short-coated dog
        _u("photo-1534361960057-19889db9621e"),  # shih tzu puppy on grass
    ),
    "construction": (
        _u("photo-1541888946425-d81bb19240f5"),  # construction workers on site
        _u("photo-1587582423116-ec07293f0395"),  # worker on building frame
        _u("photo-1589939705384-5185137a7f0f"),  # worker with power tool
        _u("photo-1579847188804-ecba0e2ea330"),  # workers at sunset
    ),
    "catering": (
        _u("photo-1555244162-803834f70033"),  # buffet chafing dishes
        _u("photo-1576842546422-60562b9242ae"),  # food displayed on table
        _u("photo-1672826979217-7156a305acf5"),  # sandwich and pastry boxes
    ),
    # -- electrician tiles ---------------------------------------------------
    "switch-socket": (
        _u("photo-1556217994-22de7face210"),  # white wall switch
        _u("photo-1698768144235-b5dbe3043bb2"),  # light switch on wall
        _u("photo-1520254695104-2765bc239df7"),  # switch on blue wall
        _u("photo-1705938298629-5e474cf76245"),  # light switch on wall
    ),
    "ceiling-fan": (
        _u("photo-1609519479841-5fd3b2884e17"),  # white 5-blade ceiling fan
        _u("photo-1555470100-1728256970aa"),  # fan shadow on ceiling
        _u("photo-1677959098115-1aafeb9313c0"),  # fan in white room
        _u("photo-1576503963299-fcd31822b523"),  # 3-blade ceiling fan
    ),
    "decorative-light": (
        _u("photo-1531762948975-73032b7b61f4"),  # crystal chandelier
        _u("photo-1627306411131-358d6d0fd2cb"),  # brass chandelier
        _u("photo-1509437142917-63dfe86dcbec"),  # gold uplight chandelier
        _u("photo-1598155038124-0ae4d7300461"),  # round pendant lamp
    ),
    "breaker-panel": (
        _u("photo-1544724569-5f546fd6f2b5"),  # switch box with breakers
        _u("photo-1566417110090-6b15a06ec800"),  # gray power switch box
        _u("photo-1576446470246-499c738d1c8e"),  # white circuit breakers
        _u("photo-1635335874521-7987db781153"),  # wires into a switch box
    ),
    "water-pump": (
        _u("photo-1534641614095-6222aed9bdd6"),  # well pump
        _u("photo-1700318092011-6e4666e94ab5"),  # small engine in red frame
    ),
    "doorbell": (
        _u("photo-1633194883650-df448a10d554"),  # video doorbell camera
        _u("photo-1704075877553-0d4a318459d7"),  # pressing a door button
        _u("photo-1606723325592-e4ef7ed5a6ae"),  # round metal bell on brick
    ),
    "electrical-testing": (
        _u("photo-1710194572710-bbd92a2d3f9c"),  # holding a multimeter
        _u("photo-1619345371662-fccc15cc4814"),  # digital multimeter
        _u("photo-1758295745926-88faff7ec2f2"),  # multimeter at a screen
        _u("photo-1758101755915-462eddc23f57"),  # testing panel with multimeter
    ),
    "house-wiring": (
        _u("photo-1601462904263-f2fa0c851cb9"),  # coated wires
        _u("photo-1635335874521-7987db781153"),  # wires into a switch box
    ),
    # -- plumber tiles -------------------------------------------------------
    "faucet": (
        _u("photo-1542013936693-884638332954"),  # person opening faucet
        _u("photo-1521207418485-99c705420785"),  # kitchen faucet running
        _u("photo-1542855368-ca6ea825bca2"),  # stainless steel faucet
        _u("photo-1642014586226-6de3da27a974"),  # washing hands under faucet
    ),
    "bathroom-fittings": (
        _u("photo-1631889993959-41b4e9c6e3c5"),  # toilet, sink and bathtub
        _u("photo-1696987007764-7f8b85dd3033"),  # two sinks, toilet, shower
        _u("photo-1631048499052-e6d9f305d2c0"),  # ceramic sink with faucet
        _u("photo-1595514535116-d0401260e7cf"),  # ceramic basin
    ),
    "drainage": (
        _u("photo-1654440122140-f1fc995ddb34"),  # metal sink drain close-up
        _u("photo-1741997376539-a63ee600dac9"),  # round drain cover
    ),
    "pipe-repair": (
        _u("photo-1676210134188-4c05dd172f89"),  # working on a pipe in a wall
        _u("photo-1676210133055-eab6ef033ce3"),  # working on a pipe in a cabinet
        _u("photo-1596394723269-b2cbca4e6313"),  # water drop on brass pipe
        _u("photo-1639600993675-2281b2c939f0"),  # pipes on a building
    ),
    "water-tank": (
        _u("photo-1541941392960-652036ca567e"),  # water tank tower
        _u("photo-1558288459-c1e780664fd5"),  # concrete water tower
        _u("photo-1676210134190-3f2c0d5cf58d"),  # fixing a water heater
        _u("photo-1533163238111-4a7ced54f2e4"),  # water treatment tanks, aerial
    ),
    # -- AC tiles ------------------------------------------------------------
    "ac-service": (
        _u("photo-1665826254141-bfa10685e002"),  # AC on yellow wall
        _u("photo-1436473849883-bb3464c23e93"),  # white unit
    ),
    "ac-repair": (
        _u("photo-1642749776312-aa42ce20c9f5"),  # technicians on a roof
        _u("photo-1757219525975-03b5984bc6e8"),  # wall-mounted AC unit
    ),
    "ac-install": (
        _u("photo-1726614846573-c1ac2e6161d1"),  # AC mounted on yellow wall
        _u("photo-1667983453881-4992fe86ab1b"),  # bank of AC units
    ),
    "hvac-duct": (
        _u("photo-1574334292321-4844f63aefef"),  # vent pipe
        _u("photo-1635604866833-70844856de75"),  # building ducting
    ),
    # -- projects, consultation, day hire ------------------------------------
    "consultation": (
        _u("photo-1503387762-592deb58ef4e"),  # architect working on a draft
        _u("photo-1608303588026-884930af2559"),  # reviewing blueprints
        _u("photo-1503387837-b154d5074bd2"),  # drafting on blueprint
        _u("photo-1721244653652-268631ec049a"),  # elevations and floor plan
    ),
    "bathroom-renovation": (
        _u("photo-1584622650111-993a426fbf0a"),  # modern bathroom with shower
        _u("photo-1620626011761-996317b8d101"),  # bathtub near plant
    ),
    "modular-kitchen": (
        _u("photo-1600489000022-c2086d79f9d4"),  # white and brown cabinets
        _u("photo-1602028915047-37269d1a73f7"),  # modern kitchen with island
    ),
    "carpentry": (
        _u("photo-1595844730298-b960ff98fee0"),  # carpenter's tool belt
        _u("photo-1561297331-a9c00b9c2c44"),  # sanding a wooden surface
        _u("photo-1544164560-adac3045edb2"),  # biscuit joiner on board
    ),
    "painting": (
        _u("photo-1717281234297-3def5ae3eee1"),  # man painting with roller
        _u("photo-1574359411659-15573a27fd0c"),  # two painters on a ladder
        _u("photo-1525909002-1b05e0c869d8"),  # coloured paint rollers
    ),
    "interior-fit-out": (
        _u("photo-1618221195710-dd6b41faaea6"),  # furnished living room
        _u("photo-1586023492125-27b2c045efd7"),  # armchair detail
        _u("photo-1616046229478-9901c5536a45"),  # wooden table interior
    ),
    "demolition": (
        _u("photo-1677588508537-5106322c2d40"),  # excavator in demolished building
        _u("photo-1616551569669-b60598758c4f"),  # excavator at a wall
        _u("photo-1603655534191-ea4d80072bf6"),  # heavy equipment
    ),
    "tiling": (
        _u("photo-1523350165414-082d792c4bcc"),  # ceramic tile grid
        _u("photo-1599031628962-1f6755a3b1b5"),  # checkered tiles
        _u("photo-1706629503586-2731f65587ae"),  # marble floor
    ),
    "terrace": (
        _u("photo-1493246318656-5bfd4cfb29b8"),  # terrace overlooking city
        _u("photo-1626279484248-59d4cc4ab19f"),  # rooftop by a pool
    ),
    "event-decor": (
        _u("photo-1511461744085-90a4d1c66be3"),  # string lights
        _u("photo-1573757747798-62adbde0f981"),  # string lights
        _u("photo-1523438885200-e635ba2c371e"),  # wedding gazebo
        _u("photo-1561593367-66c79c2294e6"),  # dining table setting
    ),
    "event-staff": (
        _u("photo-1516788875874-c5912cae7b43"),  # waiter serving beverages
        _u("photo-1588675646184-f5b0b0b0b2de"),  # server with notepad
    ),
    "bridal-makeup": (
        _u("photo-1684868265714-fd2300637c23"),  # bride in bridal outfit
        _u("photo-1610047614301-13c63f00c032"),  # red and gold sari
        _u("photo-1596462502278-27bfdc403348"),  # makeup brush set
    ),
    # -- technician trade tiles ----------------------------------------------
    "drinking-water": (
        _u("photo-1521207418485-99c705420785"),  # kitchen faucet running
    ),
    "wifi-router": (
        _u("photo-1606904825846-647eb07f5be2"),  # white router
        _u("photo-1516044734145-07ca8eef8731"),  # modem router
    ),
    "gas-stove": (
        _u("photo-1607324772107-8ad6740ca195"),  # gas stove
        _u("photo-1608454770647-01dc0f7dd97d"),  # gas stove burners
    ),
    "computer-repair": (
        _u("photo-1721333089073-215a56fd710c"),  # laptop with screwdriver
        _u("photo-1620283085439-39620a1e21c4"),  # motherboard
        _u("photo-1721332154191-ba5f1534266e"),  # working on electronics
    ),
    "phone-repair": (
        _u("photo-1550041473-d296a3a8a18a"),  # repairing a smartphone
        _u("photo-1611396000732-f8c9a933424f"),  # electronic devices
    ),
    "cctv": (
        _u("photo-1589935447067-5531094415d1"),  # security cameras
        _u("photo-1528312635006-8ea0bc49ec63"),  # security camera on post
    ),
    "locksmith": (
        _u("photo-1585914641050-fa9883c4e21c"),  # padlock on white door
        _u("flagged/photo-1564767609213-c75ee685263a"),  # hand on door lever
    ),
    "home-theater": (
        _u("photo-1721733258410-35e699661ad6"),  # couch and flat screen
    ),
    "fire-safety": (
        _u("photo-1625958936686-a9343dc35b5b"),  # fire extinguisher
        _u("photo-1712640379137-6d2532f887a7"),  # extinguisher on wall
    ),
    # -- beautician tiles ----------------------------------------------------
    "facial": (
        _u("photo-1570172619644-dfd03ed5d881"),  # facial mask at spa
        _u("photo-1643684391140-c5056cfd3436"),  # facial massage
        _u("photo-1616394584738-fc6e612e71b9"),  # cream on face
    ),
    "makeup": (
        _u("photo-1596462502278-27bfdc403348"),  # brush set
        _u("photo-1709477542170-f11ee7d471a0"),  # applying makeup
        _u("photo-1596704017254-9b121068fb31"),  # palette and pencil
    ),
    "hair-salon": (
        _u("photo-1634449571010-02389ed0f9b0"),  # haircut at salon
        _u("photo-1580618672591-eb180b1a973f"),  # blow dryer and brush
        _u("photo-1560869713-7d0a29430803"),  # hair curler
    ),
    "manicure": (
        _u("photo-1632345031435-8727f6897d53"),  # nails done at salon
        _u("photo-1610992015762-45dca7fa3a85"),  # manicured nails
    ),
    "mehendi": (
        _u("photo-1525135850648-b42365991054"),  # mehndi on hand
        _u("photo-1505932794465-147d1f1b2c97"),  # henna patterns
    ),
    "spa-massage": (
        _u("photo-1741522509438-a120c0bb5e88"),  # back massage
        _u("photo-1600334089648-b0d9d3028eb2"),  # hot stone massage
        _u("photo-1519823551278-64ac92734fb1"),  # massage
    ),
    # -- home services tiles -------------------------------------------------
    "sofa-cleaning": (
        _u("photo-1686178827149-6d55c72d81df"),  # vacuuming an ottoman
        _u("photo-1555041469-a586c61ea9bc"),  # green fabric sofa
        _u("photo-1567016432779-094069958ea5"),  # red fabric sofa
    ),
    "pest-control": (
        _u("photo-1747659629851-a92bd71149f6"),  # holding a spray gun
        _u("photo-1638820842410-dbe10a8a61f0"),  # flies on a table
    ),
    "laundry": (
        _u("photo-1626806819282-2c1dc01a5e0c"),  # washer and dryer
        _u("photo-1582735689369-4fe89db7114c"),  # laundry basket
    ),
    "gardening": (
        _u("photo-1611843467160-25afb8df1074"),  # planting seedlings
        _u("photo-1515150144380-bca9f1650ed9"),  # watering a plant
    ),
    # -- pet tiles -----------------------------------------------------------
    "veterinary": (
        _u("photo-1596272875729-ed2ff7d6d9c5"),  # person holding a cat
    ),
    "dog-walking": (
        _u("photo-1530700131180-d43d9b8cc41f"),  # walking a golden retriever
        _u("photo-1599406580992-46ab5d96f296"),  # walking a white dog
    ),
    "pet-photography": (
        _u("photo-1534361960057-19889db9621e"),  # puppy running on grass
    ),
}


def image_for(subject: str, position: int = 0) -> str:
    """One URL from a subject's pool, rotating by ``position`` for service covers.

    Raises ``KeyError`` on an unknown subject: a seed naming a subject nobody curated
    should fail at seed time, not render a broken tile.
    """

    pool = SEED_IMAGE_POOLS[subject]
    return pool[position % len(pool)]
