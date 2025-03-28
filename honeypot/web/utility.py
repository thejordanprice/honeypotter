import uuid
import os
import re
from typing import Dict, Optional
from pathlib import Path
from functools import lru_cache

class StaticVersioner:
    """Utility class for adding version query parameters to static files."""
    
    def __init__(self):
        self._version_cache: Dict[str, str] = {}
    
    def get_versioned_url(self, path: str) -> str:
        """
        Add a version query parameter to a static file URL.
        
        Args:
            path: The path to the static file (relative to /static/)
            
        Returns:
            The path with a version query parameter appended
        """
        if not path:
            return path
            
        # Strip any existing version parameter
        clean_path = re.sub(r'\?v=[^&]+', '', path)
        
        # Get or generate a version string
        if clean_path not in self._version_cache:
            # Generate a short UUID (first 8 chars)
            self._version_cache[clean_path] = str(uuid.uuid4())[:8]
            
        # Append the version parameter
        if '?' in clean_path:
            return f"{clean_path}&v={self._version_cache[clean_path]}"
        else:
            return f"{clean_path}?v={self._version_cache[clean_path]}"
    
    def clear_cache(self) -> None:
        """Clear the version cache, forcing new versions to be generated."""
        self._version_cache.clear()

# Create a singleton instance
static_versioner = StaticVersioner()

# Jinja2 template function
def versioned_static(path: str) -> str:
    """
    Template function to add a version parameter to static URLs.
    Usage in template: {{ versioned_static('/css/styles.css') }}
    
    Args:
        path: Path to the static file
        
    Returns:
        Versioned URL
    """
    if not path.startswith('/static/'):
        path = f"/static/{path.lstrip('/')}"
    
    return static_versioner.get_versioned_url(path) 