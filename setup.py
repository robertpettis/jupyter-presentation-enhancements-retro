"""jupyter-presentation-enhancements-retro: RISE presentation enhancements for
classic Notebook 6, for a specific legacy environment.

Installing this package (pip install git+https://... ) drops the nbextension
into share/jupyter/nbextensions and enables it via etc/jupyter/nbconfig, so no
`jupyter nbextension install/enable` step is needed inside the target env.
"""
import os
from glob import glob

from setuptools import find_packages, setup

HERE = os.path.abspath(os.path.dirname(__file__))

nbextension_files = sorted(
    glob(os.path.join("jupyter_presentation_enhancements_retro", "nbextension", "*"))
)

with open(os.path.join(HERE, "README.md"), encoding="utf-8") as f:
    long_description = f.read()

setup(
    name="jupyter-presentation-enhancements-retro",
    version="0.2.0",
    description=(
        "Speaker notes in cell metadata (and other RISE presentation "
        "enhancements) for classic Jupyter Notebook 6 (legacy RISE "
        "environments)."
    ),
    long_description=long_description,
    long_description_content_type="text/markdown",
    author="Robert Pettis",
    author_email="pettis.robert@gmail.com",
    license="BSD-3-Clause",
    packages=find_packages(),
    include_package_data=True,
    data_files=[
        (
            "share/jupyter/nbextensions/presentation_enhancements_retro",
            nbextension_files,
        ),
        (
            "etc/jupyter/nbconfig/notebook.d",
            [
                "jupyter-config/nbconfig/notebook.d/"
                "presentation_enhancements_retro.json"
            ],
        ),
    ],
    install_requires=["notebook>=6,<7"],
    python_requires=">=3.7",
    zip_safe=False,
    classifiers=[
        "Framework :: Jupyter",
        "License :: OSI Approved :: BSD License",
        "Programming Language :: Python :: 3",
    ],
)
