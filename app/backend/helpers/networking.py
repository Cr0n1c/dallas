import re

# Constants
HTTP_TIMEOUT = 10

# IMDS endpoints to block
IMDS_PATTERNS = [
    r"^http://169\.254\.169\.254/.*$",  # IPv4
    r"^http://\[fd00:ec2::254\]/.*$",  # IPv6
    r"^http://metadata\.google\.internal/.*$",  # GCP
]


def is_imds_endpoint(url: str) -> bool:
    """Check if the URL is an IMDS endpoint."""
    return any(re.match(pattern, url) for pattern in IMDS_PATTERNS)
