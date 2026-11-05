"""npm run deploy (scripts/deploy.py): 함수 폴더 + shared 를 폴더 없이 한 zip 으로, 같은 코드면 같은 zip"""
import os
import sys
import unittest
import zipfile
import io

from helpers import FUNCTIONS, LAMBDA_DIR

sys.path.insert(0, os.path.join(os.path.dirname(LAMBDA_DIR), "scripts"))
import deploy  # noqa: E402


class Build(unittest.TestCase):
    def test_zip_has_function_and_shared_files_flat(self):
        self.assertEqual(deploy.FUNCTIONS, FUNCTIONS)
        for name in FUNCTIONS:
            data, names = deploy.build(name)
            inside = zipfile.ZipFile(io.BytesIO(data)).namelist()
            self.assertEqual(inside, names)
            self.assertTrue({"lambda_function.py", "core.py", "ai.py"} <= set(inside), name)
            self.assertFalse(any("/" in n for n in inside), name)          # 폴더 없이 (No module named 'core' 방지)
            self.assertEqual(deploy.build(name)[0], data)                  # 같은 코드면 같은 zip → 올리지 않음

    def test_account_number_is_hidden(self):
        self.assertEqual(deploy.hide("arn:aws:lambda:ap-northeast-2:123456789012:function:x"), "arn:aws:lambda:ap-northeast-2:<계정>:function:x")


if __name__ == "__main__":
    unittest.main()
