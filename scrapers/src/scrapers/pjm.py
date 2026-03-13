import io
import requests
import pandas as pd
from .base import BaseScraper
from ..config import HTTP_HEADERS, REQUEST_TIMEOUT, PJM_API_KEY, PJM_QUEUE_URL
from ..transform import transform_pjm


class PJMScraper(BaseScraper):
    iso_region = "PJM"

    def fetch_and_transform(self) -> pd.DataFrame:
        resp = requests.post(
            PJM_QUEUE_URL,
            headers={
                **HTTP_HEADERS,
                "api-subscription-key": PJM_API_KEY,
                "Origin": "https://www.pjm.com",
                "Referer": "https://www.pjm.com/",
            },
            timeout=REQUEST_TIMEOUT,
        )
        resp.raise_for_status()
        content = io.BytesIO(resp.content)
        df = pd.read_excel(content)
        return transform_pjm(df)
