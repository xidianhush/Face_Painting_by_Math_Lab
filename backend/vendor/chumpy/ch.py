"""Minimal chumpy.Ch shim.

Only used to unpickle FLAME's generic_model.pkl (which stores chumpy.Ch objects)
under Python 3.11 / numpy 2.x, where the original chumpy 0.69 no longer installs.

FLAME.py only consumes these objects via np.array(), .shape, indexing and
np.reshape, so this shim implements exactly that surface.
"""
import numpy as np


class Ch:
    __array_priority__ = 2.0

    @property
    def r(self):
        return np.asarray(self.x)

    @property
    def shape(self):
        return self.r.shape

    def __array__(self, dtype=None):
        arr = self.r
        return arr if dtype is None else np.asarray(arr, dtype=dtype)

    def __getitem__(self, key):
        return self.r[key]

    def __len__(self):
        return len(self.r)
