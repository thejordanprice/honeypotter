import unittest
from honeypot.web.utility import StaticVersioner, versioned_static

class TestStaticVersioning(unittest.TestCase):
    def setUp(self):
        self.versioner = StaticVersioner()

    def test_versioning_adds_parameter(self):
        """Test that the versioner adds a version parameter to paths."""
        path = "/static/js/main.js"
        versioned = self.versioner.get_versioned_url(path)
        
        # Check the versioned path has the expected format
        self.assertRegex(versioned, r"/static/js/main\.js\?v=[a-zA-Z0-9]+")
        
    def test_versioning_is_consistent(self):
        """Test that the same path gets the same version during a session."""
        path = "/static/js/main.js"
        versioned1 = self.versioner.get_versioned_url(path)
        versioned2 = self.versioner.get_versioned_url(path)
        
        # The version should be the same for both calls
        self.assertEqual(versioned1, versioned2)
        
    def test_versioning_is_different_for_different_files(self):
        """Test that different paths get different versions."""
        path1 = "/static/js/main.js"
        path2 = "/static/js/utility.js"
        versioned1 = self.versioner.get_versioned_url(path1)
        versioned2 = self.versioner.get_versioned_url(path2)
        
        # The versions should be different
        self.assertNotEqual(versioned1, versioned2)
        
    def test_versioning_clears_cache(self):
        """Test that clearing the cache generates new versions."""
        path = "/static/js/main.js"
        versioned1 = self.versioner.get_versioned_url(path)
        
        # Clear the cache and get a new version
        self.versioner.clear_cache()
        versioned2 = self.versioner.get_versioned_url(path)
        
        # The versions should be different after clearing the cache
        self.assertNotEqual(versioned1, versioned2)
        
    def test_template_function(self):
        """Test the template function works correctly."""
        # Test with absolute path (with /static/)
        result = versioned_static("/static/js/main.js")
        self.assertRegex(result, r"/static/js/main\.js\?v=[a-zA-Z0-9]+")
        
        # Test with relative path (without /static/)
        result = versioned_static("js/main.js")
        self.assertRegex(result, r"/static/js/main\.js\?v=[a-zA-Z0-9]+")

if __name__ == "__main__":
    unittest.main() 