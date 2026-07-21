#!/usr/bin/env python3
"""
JARVIS Backend API Test Suite
Tests all backend endpoints with real Italian queries
"""

import requests
import json
import time
from typing import Dict, Any, List

# Backend URL from environment
BACKEND_URL = "https://jarvis-assistant-603.preview.emergentagent.com/api"

class Colors:
    GREEN = '\033[92m'
    RED = '\033[91m'
    YELLOW = '\033[93m'
    BLUE = '\033[94m'
    END = '\033[0m'
    BOLD = '\033[1m'

def print_test_header(test_name: str):
    """Print formatted test header"""
    print(f"\n{Colors.BLUE}{Colors.BOLD}{'='*80}{Colors.END}")
    print(f"{Colors.BLUE}{Colors.BOLD}TEST: {test_name}{Colors.END}")
    print(f"{Colors.BLUE}{Colors.BOLD}{'='*80}{Colors.END}")

def print_success(message: str):
    """Print success message"""
    print(f"{Colors.GREEN}✓ {message}{Colors.END}")

def print_error(message: str):
    """Print error message"""
    print(f"{Colors.RED}✗ {message}{Colors.END}")

def print_warning(message: str):
    """Print warning message"""
    print(f"{Colors.YELLOW}⚠ {message}{Colors.END}")

def print_info(message: str):
    """Print info message"""
    print(f"{Colors.BLUE}ℹ {message}{Colors.END}")

def test_health_check() -> bool:
    """Test 1: Health Check Endpoint"""
    print_test_header("1. Health Check")
    
    try:
        response = requests.get(f"{BACKEND_URL}/health", timeout=10)
        print_info(f"Status Code: {response.status_code}")
        
        if response.status_code != 200:
            print_error(f"Expected status 200, got {response.status_code}")
            return False
        
        data = response.json()
        print_info(f"Response: {json.dumps(data, indent=2)}")
        
        # Verify required fields
        if data.get("status") != "healthy":
            print_error(f"Expected status 'healthy', got '{data.get('status')}'")
            return False
        print_success("Status is 'healthy'")
        
        if not data.get("llm_configured"):
            print_error("LLM is not configured")
            return False
        print_success("LLM is configured")
        
        serper_configured = data.get("serper_configured", False)
        if serper_configured:
            print_success("Serper API is configured")
        else:
            print_warning("Serper API is not configured (using mock data)")
        
        print_success("Health check passed")
        return True
        
    except Exception as e:
        print_error(f"Health check failed: {str(e)}")
        return False

def test_process_search_real_estate(stored_search_ids: List[str]) -> bool:
    """Test 2: Process Search with Real Estate Agent (MOST IMPORTANT)"""
    print_test_header("2. Process Search - Real Estate (Italian)")
    
    payload = {
        "query": "Cerco un bilocale a Torino in zona San Paolo, budget 120.000 euro, ristrutturato",
        "category": "immobili",
        "language": "it"
    }
    
    try:
        print_info(f"Sending request to: {BACKEND_URL}/search/process")
        print_info(f"Payload: {json.dumps(payload, indent=2)}")
        
        response = requests.post(
            f"{BACKEND_URL}/search/process",
            json=payload,
            timeout=30
        )
        
        print_info(f"Status Code: {response.status_code}")
        
        if response.status_code != 200:
            print_error(f"Expected status 200, got {response.status_code}")
            print_error(f"Response: {response.text}")
            return False
        
        data = response.json()
        print_info(f"Response: {json.dumps(data, indent=2, ensure_ascii=False)}")
        
        # Verify search_id
        if "search_id" not in data:
            print_error("Missing 'search_id' in response")
            return False
        search_id = data["search_id"]
        stored_search_ids.append(search_id)
        print_success(f"Got search_id: {search_id}")
        
        # Verify agent_type
        if data.get("agent_type") != "real_estate":
            print_error(f"Expected agent_type 'real_estate', got '{data.get('agent_type')}'")
            return False
        print_success("Agent type is 'real_estate'")
        
        # Verify summary (should be in Italian)
        summary = data.get("summary", "")
        if not summary:
            print_error("Missing or empty 'summary'")
            return False
        print_success(f"Got summary (Italian): {summary[:100]}...")
        
        # Verify keywords (should be Italian)
        keywords = data.get("keywords", [])
        if not isinstance(keywords, list):
            print_error("Keywords is not a list")
            return False
        if len(keywords) == 0:
            print_warning("Keywords array is empty")
        else:
            print_success(f"Got {len(keywords)} keywords: {keywords}")
        
        # Verify results array
        results = data.get("results", [])
        if not isinstance(results, list):
            print_error("Results is not a list")
            return False
        if len(results) == 0:
            print_error("Results array is empty")
            return False
        print_success(f"Got {len(results)} results")
        
        # Verify each result has required fields
        for i, result in enumerate(results):
            print_info(f"Checking result {i+1}...")
            
            required_fields = ["title", "summary", "keywords", "source_link", "contacts"]
            for field in required_fields:
                if field not in result:
                    print_error(f"Result {i+1} missing field: {field}")
                    return False
            
            print_success(f"Result {i+1}: {result['title']}")
            print_info(f"  Summary: {result['summary'][:80]}...")
            print_info(f"  Keywords: {result['keywords']}")
            print_info(f"  Link: {result['source_link']}")
            print_info(f"  Contacts: {result['contacts']}")
        
        print_success("Real estate search test passed")
        return True
        
    except Exception as e:
        print_error(f"Real estate search test failed: {str(e)}")
        import traceback
        traceback.print_exc()
        return False

def test_process_search_job(stored_search_ids: List[str]) -> bool:
    """Test 3: Process Search with Job Agent"""
    print_test_header("3. Process Search - Job (Italian)")
    
    payload = {
        "query": "Cerco lavoro come sviluppatore a Milano",
        "category": "lavoro",
        "language": "it"
    }
    
    try:
        print_info(f"Sending request to: {BACKEND_URL}/search/process")
        print_info(f"Payload: {json.dumps(payload, indent=2)}")
        
        response = requests.post(
            f"{BACKEND_URL}/search/process",
            json=payload,
            timeout=30
        )
        
        print_info(f"Status Code: {response.status_code}")
        
        if response.status_code != 200:
            print_error(f"Expected status 200, got {response.status_code}")
            print_error(f"Response: {response.text}")
            return False
        
        data = response.json()
        print_info(f"Response: {json.dumps(data, indent=2, ensure_ascii=False)}")
        
        # Verify agent_type
        if data.get("agent_type") != "job":
            print_error(f"Expected agent_type 'job', got '{data.get('agent_type')}'")
            return False
        print_success("Agent type is 'job'")
        
        # Store search_id
        if "search_id" in data:
            stored_search_ids.append(data["search_id"])
            print_success(f"Got search_id: {data['search_id']}")
        
        # Verify summary
        if not data.get("summary"):
            print_error("Missing or empty summary")
            return False
        print_success(f"Got summary: {data['summary'][:100]}...")
        
        # Verify keywords
        keywords = data.get("keywords", [])
        if len(keywords) > 0:
            print_success(f"Got {len(keywords)} keywords: {keywords}")
        else:
            print_warning("Keywords array is empty")
        
        print_success("Job search test passed")
        return True
        
    except Exception as e:
        print_error(f"Job search test failed: {str(e)}")
        import traceback
        traceback.print_exc()
        return False

def test_get_active_searches(expected_count: int) -> bool:
    """Test 4: Get Active Searches"""
    print_test_header("4. Get Active Searches")
    
    try:
        response = requests.get(f"{BACKEND_URL}/search/active", timeout=10)
        print_info(f"Status Code: {response.status_code}")
        
        if response.status_code != 200:
            print_error(f"Expected status 200, got {response.status_code}")
            return False
        
        data = response.json()
        print_info(f"Response: {json.dumps(data, indent=2, ensure_ascii=False)}")
        
        if not isinstance(data, list):
            print_error("Response is not a list")
            return False
        
        print_success(f"Got {len(data)} active searches")
        
        if len(data) < expected_count:
            print_warning(f"Expected at least {expected_count} searches, got {len(data)}")
        
        # Verify structure of searches
        for i, search in enumerate(data[:3]):  # Check first 3
            print_info(f"Search {i+1}: {search.get('query', 'N/A')[:50]}...")
            print_info(f"  Category: {search.get('category')}")
            print_info(f"  Language: {search.get('language')}")
            print_info(f"  Active: {search.get('is_active')}")
        
        print_success("Get active searches test passed")
        return True
        
    except Exception as e:
        print_error(f"Get active searches test failed: {str(e)}")
        return False

def test_get_search_results(search_id: str) -> bool:
    """Test 5: Get Search Results"""
    print_test_header("5. Get Search Results")
    
    try:
        print_info(f"Getting results for search_id: {search_id}")
        response = requests.get(
            f"{BACKEND_URL}/search/{search_id}/results",
            timeout=10
        )
        
        print_info(f"Status Code: {response.status_code}")
        
        if response.status_code != 200:
            print_error(f"Expected status 200, got {response.status_code}")
            return False
        
        data = response.json()
        print_info(f"Response: {json.dumps(data, indent=2, ensure_ascii=False)}")
        
        if not isinstance(data, list):
            print_error("Response is not a list")
            return False
        
        print_success(f"Got {len(data)} results for search")
        
        if len(data) > 0:
            print_info(f"First result: {data[0].get('title', 'N/A')}")
        
        print_success("Get search results test passed")
        return True
        
    except Exception as e:
        print_error(f"Get search results test failed: {str(e)}")
        return False

def test_delete_search(search_id: str) -> bool:
    """Test 6: Delete Search"""
    print_test_header("6. Delete Search")
    
    try:
        print_info(f"Deleting search_id: {search_id}")
        response = requests.delete(
            f"{BACKEND_URL}/search/{search_id}",
            timeout=10
        )
        
        print_info(f"Status Code: {response.status_code}")
        
        if response.status_code != 200:
            print_error(f"Expected status 200, got {response.status_code}")
            return False
        
        data = response.json()
        print_info(f"Response: {json.dumps(data, indent=2)}")
        
        if "message" not in data:
            print_error("Missing 'message' in response")
            return False
        
        print_success(f"Delete response: {data['message']}")
        print_success("Delete search test passed")
        return True
        
    except Exception as e:
        print_error(f"Delete search test failed: {str(e)}")
        return False

def main():
    """Run all tests"""
    print(f"\n{Colors.BOLD}{'='*80}{Colors.END}")
    print(f"{Colors.BOLD}JARVIS BACKEND API TEST SUITE{Colors.END}")
    print(f"{Colors.BOLD}Backend URL: {BACKEND_URL}{Colors.END}")
    print(f"{Colors.BOLD}{'='*80}{Colors.END}")
    
    results = {}
    stored_search_ids = []
    
    # Test 1: Health Check
    results["health_check"] = test_health_check()
    time.sleep(1)
    
    # Test 2: Process Search - Real Estate (MOST IMPORTANT)
    results["process_search_real_estate"] = test_process_search_real_estate(stored_search_ids)
    time.sleep(2)
    
    # Test 3: Process Search - Job
    results["process_search_job"] = test_process_search_job(stored_search_ids)
    time.sleep(2)
    
    # Test 4: Get Active Searches
    results["get_active_searches"] = test_get_active_searches(expected_count=2)
    time.sleep(1)
    
    # Test 5: Get Search Results (use first search_id)
    if stored_search_ids:
        results["get_search_results"] = test_get_search_results(stored_search_ids[0])
        time.sleep(1)
    else:
        print_warning("No search_id available for get_search_results test")
        results["get_search_results"] = False
    
    # Test 6: Delete Search (use first search_id)
    if stored_search_ids:
        results["delete_search"] = test_delete_search(stored_search_ids[0])
        time.sleep(1)
    else:
        print_warning("No search_id available for delete_search test")
        results["delete_search"] = False
    
    # Print summary
    print(f"\n{Colors.BOLD}{'='*80}{Colors.END}")
    print(f"{Colors.BOLD}TEST SUMMARY{Colors.END}")
    print(f"{Colors.BOLD}{'='*80}{Colors.END}")
    
    passed = sum(1 for v in results.values() if v)
    total = len(results)
    
    for test_name, passed_test in results.items():
        status = f"{Colors.GREEN}PASSED{Colors.END}" if passed_test else f"{Colors.RED}FAILED{Colors.END}"
        print(f"{test_name}: {status}")
    
    print(f"\n{Colors.BOLD}Total: {passed}/{total} tests passed{Colors.END}")
    
    if passed == total:
        print(f"{Colors.GREEN}{Colors.BOLD}✓ ALL TESTS PASSED{Colors.END}")
        return 0
    else:
        print(f"{Colors.RED}{Colors.BOLD}✗ SOME TESTS FAILED{Colors.END}")
        return 1

if __name__ == "__main__":
    exit(main())
