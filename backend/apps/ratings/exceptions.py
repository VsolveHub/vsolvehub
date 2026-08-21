from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class RatingDomainError(Exception):
    code: str
    message: str
    status_code: int


class RatingNotFoundError(RatingDomainError):
    def __init__(self) -> None:
        super().__init__("rating_subject_not_found", "This completed work was not found.", 404)


class RatingNotReadyError(RatingDomainError):
    def __init__(self) -> None:
        super().__init__(
            "rating_not_ready",
            "A rating can be added after the work is completed.",
            409,
        )


class RatingAlreadySubmittedError(RatingDomainError):
    def __init__(self) -> None:
        super().__init__(
            "rating_already_submitted",
            "Your rating for this work has already been submitted.",
            409,
        )
