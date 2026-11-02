import unittest
from analyzer import analyze

class AnalysisTests(unittest.TestCase):
    def test_keepalive(self):
        result = analyze("Sep 14 12:33:06.442 WARN audio-forwarding Ping Pong Monitor timeout, closing websocket")
        self.assertEqual(result["counts"]["audio_keepalive_timeout"], 1)
        self.assertEqual(result["events"][0]["utc"], "Sep 14 12:33:06.442")
    def test_call_stages_not_double_counted(self):
        result=analyze("Sep 14 16:05:11.884 INFO server Received stage CHECK_START_CALL\nSep 14 16:05:12.006 INFO server Received stage START_CALL")
        self.assertEqual(result["counts"]["call_check"],1)
        self.assertEqual(result["counts"]["call_start"],1)
    def test_no_unjustified_diagnosis(self):
        result=analyze("unrecognized data")
        self.assertEqual(result["counts"],{})
        self.assertTrue(any("hypothesis" in x.lower() for x in result["limitations"]))

if __name__=="__main__":
    unittest.main()
