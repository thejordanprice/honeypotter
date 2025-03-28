from fastapi.staticfiles import StaticFiles
from starlette.datastructures import URL
from starlette.responses import FileResponse, Response
from starlette.types import Scope
from pathlib import Path
import re
import logging

logger = logging.getLogger(__name__)

class VersionedStaticFiles(StaticFiles):
    """
    Custom StaticFiles class that ignores version query parameters in file paths.
    This enables adding version parameters like ?v=abc123 to static file URLs for cache busting
    without affecting the ability to serve the files correctly.
    """
    
    async def get_response(self, path: str, scope: Scope) -> Response:
        """
        Get a response for a given path, stripping any version query parameters.
        
        Args:
            path: The request path
            scope: The request scope
            
        Returns:
            The file response
        """
        # Extract the file path from the URL, removing any version query parameter
        try:
            url = URL(scope=scope)
            # Strip out version query parameter if present
            if 'v' in url.query_params:
                # Create a new query string without the 'v' parameter
                filtered_query = "&".join(
                    [f"{k}={v}" for k, v in url.query_params.items() if k != 'v']
                )
                # Reconstruct the path with the filtered query
                if filtered_query:
                    path = f"{path.split('?')[0]}?{filtered_query}"
                else:
                    path = path.split('?')[0]
                
                logger.debug(f"Stripped version parameter: {url.path}?{url.query} -> {path}")
        
        except Exception as e:
            logger.error(f"Error processing static file path: {str(e)}")
        
        # Call the parent class method to serve the file
        return await super().get_response(path, scope) 