"""Offline GSTIN checks: shape, state code, PAN part and the check character.

Nothing here calls the internet. A GSTIN that passes is well formed, not proven to be Active on
the GST portal; Operations confirms that by hand.
"""

import re
from dataclasses import dataclass

CHARSET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"

STATE_NAMES = {
    "01": "Jammu & Kashmir",
    "02": "Himachal Pradesh",
    "03": "Punjab",
    "04": "Chandigarh",
    "05": "Uttarakhand",
    "06": "Haryana",
    "07": "Delhi",
    "08": "Rajasthan",
    "09": "Uttar Pradesh",
    "10": "Bihar",
    "11": "Sikkim",
    "12": "Arunachal Pradesh",
    "13": "Nagaland",
    "14": "Manipur",
    "15": "Mizoram",
    "16": "Tripura",
    "17": "Meghalaya",
    "18": "Assam",
    "19": "West Bengal",
    "20": "Jharkhand",
    "21": "Odisha",
    "22": "Chhattisgarh",
    "23": "Madhya Pradesh",
    "24": "Gujarat",
    "26": "Dadra & Nagar Haveli and Daman & Diu",
    "27": "Maharashtra",
    "29": "Karnataka",
    "30": "Goa",
    "31": "Lakshadweep",
    "32": "Kerala",
    "33": "Tamil Nadu",
    "34": "Puducherry",
    "35": "Andaman & Nicobar",
    "36": "Telangana",
    "37": "Andhra Pradesh",
    "38": "Ladakh",
    "97": "Other Territory",
    "99": "Centre Jurisdiction",
}

#: PAN 4th letter -> the legal structure it is expected for. `None` means no single structure
#: fits, so the letter is only ever a hint.
PAN_HOLDER_STRUCTURE = {
    "P": "PROPRIETORSHIP",
    "F": "PARTNERSHIP_LLP",
    "C": "COMPANY",
    "T": "TRUST_SOCIETY_NGO",
    "A": "TRUST_SOCIETY_NGO",
    "G": "GOVERNMENT",
    "L": "GOVERNMENT",
    "H": None,
    "B": None,
    "J": None,
}

_PAN_PART = re.compile(r"^[A-Z]{5}[0-9]{4}[A-Z]$")
_SHAPE = re.compile(r"^[A-Z0-9]{15}$")


class GstinInvalidError(ValueError):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


@dataclass(frozen=True)
class GstinFacts:
    gstin: str
    state_code: str
    state_name: str
    pan: str
    pan_holder_letter: str


def gstin_check_char(first14: str) -> str:
    total = 0
    for i, char in enumerate(first14):
        value = CHARSET.index(char) * (1 if i % 2 == 0 else 2)
        total += value // 36 + value % 36
    return CHARSET[(36 - total % 36) % 36]


def validate_gstin(raw: str) -> GstinFacts:
    gstin = "".join(raw.split()).upper()
    format_error = GstinInvalidError("gstin_format", "A GSTIN has 15 letters and numbers.")
    if not _SHAPE.match(gstin):
        raise format_error
    state_code = gstin[:2]
    if state_code not in STATE_NAMES:
        raise GstinInvalidError("gstin_state", "The first two digits must be a state code.")
    pan = gstin[2:12]
    if not _PAN_PART.match(pan):
        raise GstinInvalidError("gstin_pan", "Characters 3-12 must be the business PAN.")
    if gstin[12] == "0":
        raise format_error
    if gstin[14] != gstin_check_char(gstin[:14]):
        raise GstinInvalidError("gstin_checksum", "This GSTIN isn't valid. Check for a typo.")
    return GstinFacts(
        gstin=gstin,
        state_code=state_code,
        state_name=STATE_NAMES[state_code],
        pan=pan,
        pan_holder_letter=pan[3],
    )
